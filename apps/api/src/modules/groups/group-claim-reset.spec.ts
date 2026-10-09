import { ConflictException, ExecutionContext, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupGuestService, sha256Hex } from './group-guest.service';
import { GroupOwnerGuard } from './guards/group-owner.guard';

/**
 * ABA-651: the owner resets ONE guest's browser claim. These run the real GroupsService and
 * GroupGuestService over a small in-memory Prisma, so "the cookie no longer resolves" and "the link
 * code dies" are observed through the same lookups production uses, not asserted on mock calls.
 */

const G = 'g-1';
const OTHER_G = 'g-2';
const TOKEN = 'a'.repeat(32);
const OWNER = 'm-owner';
const ANN = 'm-ann'; // a claimed guest
const BO = 'm-bo'; // a claimed guest, untouched by the reset
const PH = 'm-ph'; // an unclaimed placeholder
const APP = 'm-app'; // an app user
const GONE = 'm-gone'; // a removed (claimed) guest
const FOREIGN = 'm-foreign'; // a claimed guest of another group
const ANN_SECRET = 'b'.repeat(32);
const BO_SECRET = 'c'.repeat(32);

type Row = Record<string, any>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v === undefined) return true;
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return (v.in as unknown[]).includes(row[k]);
      if ('not' in v) return row[k] !== v.not;
      return true;
    }
    return (row[k] ?? null) === v;
  });
}

function mkMember(id: string, over: Row = {}): Row {
  return {
    id,
    groupId: G,
    userId: null,
    displayName: id.replace('m-', ''),
    nameKey: id.replace('m-', ''),
    claimTokenHash: null,
    claimedAt: null,
    paymentMethod: null,
    paymentHandle: null,
    removedAt: null,
    createdAt: new Date('2026-01-01'),
    ...over,
  };
}

describe('Group claim reset (ABA-651)', () => {
  let members: Row[];
  let events: Row[];
  let group: Row;
  let store: Map<string, unknown>;
  let prisma: any;
  let cache: any;
  let groups: GroupsService;
  let guest: GroupGuestService;

  beforeEach(() => {
    group = {
      id: G,
      name: 'Flat',
      emoji: null,
      currencyCode: 'PLN',
      ownerUserId: 'u-owner',
      guestToken: TOKEN,
      guestAccess: true,
      status: 'active',
      ledgerVersion: 4,
    };
    members = [
      mkMember(OWNER, { userId: 'u-owner' }),
      mkMember(ANN, { claimTokenHash: sha256Hex(ANN_SECRET), claimedAt: new Date('2026-02-01'), paymentMethod: 'blik', paymentHandle: '+48 600 100 200' }),
      mkMember(BO, { claimTokenHash: sha256Hex(BO_SECRET), claimedAt: new Date('2026-02-01'), paymentMethod: 'revolut', paymentHandle: '@bo' }),
      mkMember(PH),
      mkMember(APP, { userId: 'u-app' }),
      mkMember(GONE, { claimTokenHash: sha256Hex('d'.repeat(32)), removedAt: new Date('2026-03-01') }),
      mkMember(FOREIGN, { groupId: OTHER_G, claimTokenHash: sha256Hex('e'.repeat(32)) }),
    ];
    events = [];
    store = new Map();

    prisma = {
      expenseGroup: {
        findUnique: jest.fn(async ({ where }: any) =>
          (where.id ? where.id === group.id : where.guestToken === group.guestToken) ? { ...group } : null,
        ),
        count: jest.fn(async () => 0),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      expenseGroupMember: {
        findFirst: jest.fn(async ({ where }: any) => {
          const m = members.find((r) => matches(r, where));
          return m ? { ...m } : null;
        }),
        findMany: jest.fn(async ({ where }: any = {}) => members.filter((r) => matches(r, where)).map((r) => ({ ...r }))),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const hit = members.filter((r) => matches(r, where));
          hit.forEach((r) => Object.assign(r, data));
          return { count: hit.length };
        }),
      },
      groupMemberEvent: {
        create: jest.fn(async ({ data }: any) => {
          events.push(data);
          return data;
        }),
        findMany: jest.fn(async () => []),
      },
      groupExpense: { findMany: jest.fn(async () => []) },
      groupSettlement: { findMany: jest.fn(async () => []) },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    cache = {
      set: jest.fn(async (k: string, v: unknown) => void store.set(k, v)),
      get: jest.fn(async (k: string) => store.get(k) ?? null),
      getAndDelete: jest.fn(async (k: string) => {
        const v = store.get(k) ?? null;
        store.delete(k);
        return v;
      }),
      setIfAbsent: jest.fn(async () => true),
      incrementWindow: jest.fn(async () => 1),
    };
    groups = new GroupsService(prisma, cache, { sendToUser: jest.fn() } as any, { getRates: jest.fn() } as any);
    guest = new GroupGuestService(prisma, cache, groups);
  });

  const guestGroup = () => ({ id: G, guestToken: TOKEN, name: 'Flat', emoji: null, currencyCode: 'PLN', status: 'active', ledgerVersion: 4 }) as any;
  const row = (id: string) => members.find((m) => m.id === id)!;

  describe('authorization', () => {
    const ctx = (req: any) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

    it('GroupOwnerGuard refuses a member who is not the owner', () => {
      const req = { user: { id: 'u-app' }, groupMember: { id: APP, userId: 'u-app', group: { id: G, ownerUserId: 'u-owner', status: 'active' } } };
      expect(() => new GroupOwnerGuard().canActivate(ctx(req))).toThrow(ForbiddenException);
    });

    it('GroupOwnerGuard refuses everyone on an orphaned group', () => {
      const req = { user: { id: 'u-owner' }, groupMember: { id: OWNER, userId: 'u-owner', group: { id: G, ownerUserId: null, status: 'active' } } };
      expect(() => new GroupOwnerGuard().canActivate(ctx(req))).toThrow(ForbiddenException);
    });
  });

  describe('resetClaim', () => {
    it('clears only the target claim and keeps the row, its name and its history', async () => {
      const before = members.map((m) => ({ ...m }));
      const out = await groups.resetClaim(G, OWNER, ANN);

      expect(out).toEqual(expect.objectContaining({ id: ANN, displayName: 'ann', isClaimed: false, isAppUser: false, removedAt: null }));
      expect(row(ANN)).toEqual({
        ...before.find((m) => m.id === ANN),
        claimTokenHash: null,
        claimedAt: null,
        paymentMethod: null,
        paymentHandle: null,
      });
      for (const m of before.filter((x) => x.id !== ANN)) expect(row(m.id)).toEqual(m);
      // Not a ledger write: no version bump.
      expect(prisma.expenseGroup.updateMany).not.toHaveBeenCalled();
    });

    it('clears the previous claimant\'s payout details in the same write, so the next claimer inherits none, and leaves other members\' alone', async () => {
      await groups.resetClaim(G, OWNER, ANN);
      const call = prisma.expenseGroupMember.updateMany.mock.calls.find((c: any[]) => c[0].where.id === ANN)[0];
      expect(call.data).toEqual({ claimTokenHash: null, claimedAt: null, paymentMethod: null, paymentHandle: null });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(row(ANN)).toEqual(expect.objectContaining({ paymentMethod: null, paymentHandle: null }));
      expect(row(BO)).toEqual(expect.objectContaining({ paymentMethod: 'revolut', paymentHandle: '@bo' }));
    });

    it('writes a claim_reset event in the same transaction', async () => {
      await groups.resetClaim(G, OWNER, ANN);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(events).toEqual([
        { groupId: G, kind: 'claim_reset', actorMemberId: OWNER, subjectMemberId: ANN, targetMemberId: null, subjectName: 'ann' },
      ]);
    });

    it('the old cookie no longer identifies anyone; other guests are unaffected', async () => {
      expect(await guest.identify(guestGroup(), ANN_SECRET)).toEqual(expect.objectContaining({ id: ANN }));
      await groups.resetClaim(G, OWNER, ANN);
      expect(await guest.identify(guestGroup(), ANN_SECRET)).toBeNull();
      expect(await guest.restore(guestGroup(), ANN_SECRET)).toBe(false);
      expect(await guest.identify(guestGroup(), BO_SECRET)).toEqual(expect.objectContaining({ id: BO }));
    });

    it('the name becomes claimable again from the guest page', async () => {
      expect(await guest.join(guestGroup(), { memberId: ANN })).toEqual({ flash: 'taken' });
      await groups.resetClaim(G, OWNER, ANN);
      const res = await guest.join(guestGroup(), { memberId: ANN });
      expect(res).toEqual({ secret: expect.stringMatching(/^[a-f0-9]{32}$/) });
      const secret = (res as { secret: string }).secret;
      expect(await guest.identify(guestGroup(), secret)).toEqual(expect.objectContaining({ id: ANN }));
    });

    it('an outstanding link code minted under the reset claim no longer redeems (410)', async () => {
      const actor = await guest.identify(guestGroup(), ANN_SECRET);
      const code = await guest.mintLinkCode(guestGroup(), actor!);
      expect(code).toMatch(/^[a-f0-9]{32}$/);
      await groups.resetClaim(G, OWNER, ANN);
      await expect(groups.linkGuest('u-thief', code!)).rejects.toMatchObject({
        status: 410,
        response: { code: 'LINK_CODE_INVALID' },
      });
      expect(row(ANN).userId).toBeNull();
    });

    it('a code from the old claim fails even after the name is re-claimed by a new device', async () => {
      const actor = await guest.identify(guestGroup(), ANN_SECRET);
      const code = await guest.mintLinkCode(guestGroup(), actor!);
      await groups.resetClaim(G, OWNER, ANN);
      await guest.join(guestGroup(), { memberId: ANN });
      await expect(groups.linkGuest('u-thief', code!)).rejects.toBeInstanceOf(GoneException);
      expect(row(ANN).userId).toBeNull();
    });

    it('a code minted by the NEW claim still works (the reset is not a permanent block)', async () => {
      await groups.resetClaim(G, OWNER, ANN);
      const { secret } = (await guest.join(guestGroup(), { memberId: ANN })) as { secret: string };
      const actor = await guest.identify(guestGroup(), secret);
      const code = await guest.mintLinkCode(guestGroup(), actor!);
      // linkGuest's success path reloads the detail; only the binding is under test here.
      await groups.linkGuest('u-ann', code!).catch(() => undefined);
      expect(row(ANN).userId).toBe('u-ann');
      expect(row(ANN).claimTokenHash).toBeNull();
    });

    it('refuses an app-user member with 404 (their identity is the JWT)', async () => {
      await expect(groups.resetClaim(G, OWNER, APP)).rejects.toBeInstanceOf(NotFoundException);
      expect(events).toHaveLength(0);
    });

    it('refuses an unclaimed placeholder with 409 NOT_CLAIMED and writes nothing', async () => {
      await expect(groups.resetClaim(G, OWNER, PH)).rejects.toMatchObject({ status: 409, response: { code: 'NOT_CLAIMED' } });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(events).toHaveLength(0);
    });

    it('refuses a removed member with 404', async () => {
      await expect(groups.resetClaim(G, OWNER, GONE)).rejects.toBeInstanceOf(NotFoundException);
      expect(row(GONE).claimTokenHash).not.toBeNull();
    });

    it('refuses a member of another group with 404 (IDOR), leaving that claim intact', async () => {
      const hash = row(FOREIGN).claimTokenHash;
      await expect(groups.resetClaim(G, OWNER, FOREIGN)).rejects.toBeInstanceOf(NotFoundException);
      expect(row(FOREIGN).claimTokenHash).toBe(hash);
      expect(events).toHaveLength(0);
    });

    it('a second reset of the same member is 409 NOT_CLAIMED', async () => {
      await groups.resetClaim(G, OWNER, ANN);
      await expect(groups.resetClaim(G, OWNER, ANN)).rejects.toBeInstanceOf(ConflictException);
      expect(events).toHaveLength(1);
    });

    it('loses a race cleanly: the CAS on the read hash matches nothing, so no event is written', async () => {
      // The guest pressed "forget this device" between the read and the write.
      const realFindFirst = prisma.expenseGroupMember.findFirst;
      prisma.expenseGroupMember.findFirst = jest.fn(async (args: any) => {
        const r = await realFindFirst(args);
        row(ANN).claimTokenHash = null;
        return r;
      });
      await expect(groups.resetClaim(G, OWNER, ANN)).rejects.toMatchObject({ status: 409, response: { code: 'NOT_CLAIMED' } });
      expect(events).toHaveLength(0);
    });
  });
});
