import 'reflect-metadata';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupItemsService } from './group-items.service';
import { computeGroupLedger } from './group-ledger';
import { CLAIM_WINDOW_MS } from './group-items';
import { GroupGuestController } from './group-guest.controller';
import { csrfFor, GroupGuestService, sha256Hex } from './group-guest.service';
import { escapeHtml } from '../receipt-split/helpers/guest-page';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ABA-655 service behaviour over a small in-memory Prisma: the lock rule, the share rewrite inside the
 * ledger-bumping transaction, settlements never touched, and every id re-scoped to the group.
 */

const G = 'g-1';
const G2 = 'g-other';
const PAYER = '00000000-0000-4000-8000-000000000001'; // app user, not the owner
const ANN = '00000000-0000-4000-8000-000000000002'; // guest
const BO = '00000000-0000-4000-8000-000000000003'; // app user
const OWNER = '00000000-0000-4000-8000-000000000004'; // app user, owner
const STRANGER = '00000000-0000-4000-8000-000000000009'; // member of another group
const E = '10000000-0000-4000-8000-000000000001';
const E_FOREIGN = '10000000-0000-4000-8000-000000000002';
const I1 = '20000000-0000-4000-8000-000000000001';
const I2 = '20000000-0000-4000-8000-000000000002';
const I3 = '20000000-0000-4000-8000-000000000003';
const I_FOREIGN = '20000000-0000-4000-8000-000000000009';

const ANN_SECRET = 'b'.repeat(32);
const ANN_HASH = sha256Hex(ANN_SECRET);
const TOKEN = 't'.repeat(32);

type Row = Record<string, any>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v === undefined) return true;
    const cur = row[k] ?? null;
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return (v.in as unknown[]).includes(cur);
      if ('not' in v) return v.not === null ? cur !== null : cur !== v.not;
      if ('gt' in v) return cur !== null && new Date(cur).getTime() > new Date(v.gt).getTime();
      if ('lt' in v) return cur !== null && new Date(cur).getTime() < new Date(v.lt).getTime();
      return true;
    }
    return cur === v;
  });
}

let seq = 0;
const uid = () => `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`;

function makeDb() {
  const now = Date.now();
  const db = {
    groups: [
      { id: G, name: 'Flat', emoji: null, currencyCode: 'PLN', ownerUserId: 'u-owner', guestToken: TOKEN, guestAccess: true, status: 'active', ledgerVersion: 5, orphanedAt: null },
      { id: G2, name: 'Other', emoji: null, currencyCode: 'PLN', ownerUserId: 'u-x', guestToken: 't2', guestAccess: true, status: 'active', ledgerVersion: 1, orphanedAt: null },
    ] as Row[],
    members: [
      { id: PAYER, groupId: G, userId: 'u-payer', displayName: 'Pat', removedAt: null, createdAt: new Date(1) },
      { id: ANN, groupId: G, userId: null, displayName: 'Ann', removedAt: null, createdAt: new Date(2), claimTokenHash: ANN_HASH },
      { id: BO, groupId: G, userId: 'u-bo', displayName: 'Bo', removedAt: null, createdAt: new Date(3) },
      { id: OWNER, groupId: G, userId: 'u-owner', displayName: 'Olga', removedAt: null, createdAt: new Date(4) },
      { id: STRANGER, groupId: G2, userId: 'u-x', displayName: 'X', removedAt: null, createdAt: new Date(5) },
    ] as Row[],
    expenses: [
      {
        id: E, groupId: G, description: 'Lidl', amount: 100, date: new Date('2026-10-09'), paidByMemberId: PAYER,
        splitType: 'exact', createdByMemberId: PAYER, originalAmount: null, originalCurrency: null, fxRate: null,
        fxRateSource: null, fxRateAt: null, itemized: true, discountAmount: null,
        claimsOpenUntil: new Date(now + CLAIM_WINDOW_MS), deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: E_FOREIGN, groupId: G2, description: 'Theirs', amount: 10, date: new Date('2026-10-09'), paidByMemberId: STRANGER,
        splitType: 'exact', createdByMemberId: STRANGER, itemized: true, discountAmount: null,
        claimsOpenUntil: new Date(now + CLAIM_WINDOW_MS), deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
      },
    ] as Row[],
    items: [
      { id: I1, groupExpenseId: E, name: 'Pizza', totalPrice: 40, lineDiscount: null, position: 0 },
      { id: I2, groupExpenseId: E, name: 'Wine', totalPrice: 30, lineDiscount: null, position: 1 },
      { id: I3, groupExpenseId: E, name: 'Bread', totalPrice: 20, lineDiscount: null, position: 2 },
      { id: I_FOREIGN, groupExpenseId: E_FOREIGN, name: 'X', totalPrice: 10, lineDiscount: null, position: 0 },
    ] as Row[],
    claims: [] as Row[],
    shares: [
      { id: 's1', groupExpenseId: E, memberId: PAYER, shareValue: 100, shareAmount: 100 },
      { id: 's2', groupExpenseId: E_FOREIGN, memberId: STRANGER, shareValue: 10, shareAmount: 10 },
    ] as Row[],
    settlements: [] as Row[],
    log: [] as string[],
  };
  return db;
}

function makePrisma(db: ReturnType<typeof makeDb>) {
  const expenseWithIncludes = (e: Row, include?: Row) => {
    if (!include) return { ...e };
    const out: Row = { ...e };
    if (include.items) {
      out.items = db.items
        .filter((i) => i.groupExpenseId === e.id)
        .sort((a, b) => a.position - b.position)
        .map((i) => ({ ...i, ...(include.items.include?.claims ? { claims: db.claims.filter((c) => c.itemId === i.id).map((c) => ({ ...c })) } : {}) }));
    }
    if (include.shares) out.shares = db.shares.filter((s) => s.groupExpenseId === e.id).map((s) => ({ ...s }));
    return out;
  };
  const prisma: any = {
    expenseGroup: {
      findUnique: jest.fn(async ({ where }: any) => {
        const g = db.groups.find((x) => (where.id !== undefined ? x.id === where.id : x.guestToken === where.guestToken));
        return g ? { ...g } : null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const g = db.groups.find((x) => x.id === where.id)!;
        if (data.ledgerVersion?.increment) {
          g.ledgerVersion += data.ledgerVersion.increment;
          db.log.push('ledgerBump');
        }
        return { ...g };
      }),
    },
    expenseGroupMember: {
      findFirst: jest.fn(async ({ where }: any) => {
        const m = db.members.find((x) => matches(x, where));
        if (!m) return null;
        const g = db.groups.find((x) => x.id === m.groupId)!;
        return { ...m, group: { ownerUserId: g.ownerUserId } };
      }),
      findMany: jest.fn(async ({ where }: any) => db.members.filter((m) => matches(m, where)).map((m) => ({ ...m }))),
      update: jest.fn(async ({ where, data }: any) => {
        db.log.push(`member:${where.id}`);
        return Object.assign(db.members.find((m) => m.id === where.id)!, data);
      }),
    },
    groupExpense: {
      findFirst: jest.fn(async ({ where, include }: any) => {
        const e = db.expenses.find((x) => matches(x, where));
        return e ? expenseWithIncludes(e, include) : null;
      }),
      findMany: jest.fn(async ({ where, include }: any) => {
        const claimant = where?.items?.some?.claims?.some?.memberId as string | undefined;
        return db.expenses
          .filter((x) => matches(x, where))
          .filter((x) => !claimant || db.claims.some((c) => c.memberId === claimant && db.items.find((i) => i.id === c.itemId)?.groupExpenseId === x.id))
          .map((e) => expenseWithIncludes(e, include ?? { shares: true }));
      }),
      count: jest.fn(async ({ where }: any) => db.expenses.filter((x) => matches(x, where)).length),
      update: jest.fn(async ({ where, data }: any) => {
        const e = db.expenses.find((x) => x.id === where.id)!;
        db.log.push(data.updatedAt && Object.keys(data).length === 1 ? `lock:${where.id}` : `update:${where.id}`);
        const { shares, ...rest } = data;
        Object.assign(e, rest);
        if (shares?.create) for (const s of shares.create) db.shares.push({ id: uid(), groupExpenseId: e.id, ...s });
        return { ...e };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const rows = db.expenses.filter((x) => matches(x, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      }),
      create: jest.fn(async ({ data }: any) => {
        const { items, shares, ...rest } = data;
        const e = { id: uid(), createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...rest };
        db.expenses.push(e);
        for (const i of items?.create ?? []) db.items.push({ groupExpenseId: e.id, ...i });
        for (const s of shares?.create ?? []) db.shares.push({ id: uid(), groupExpenseId: e.id, ...s });
        return e;
      }),
    },
    groupExpenseItem: {
      findMany: jest.fn(async ({ where }: any) => db.items.filter((x) => matches(x, where)).sort((a, b) => a.position - b.position)),
      deleteMany: jest.fn(async ({ where }: any) => {
        const gone = db.items.filter((x) => matches(x, where)).map((x) => x.id);
        db.items = db.items.filter((x) => !gone.includes(x.id));
        db.claims = db.claims.filter((c) => !gone.includes(c.itemId)); // FK cascade
        return { count: gone.length };
      }),
      create: jest.fn(async ({ data }: any) => db.items.push({ ...data })),
      update: jest.fn(async ({ where, data }: any) => Object.assign(db.items.find((x) => x.id === where.id)!, data)),
    },
    groupItemClaim: {
      findMany: jest.fn(async ({ where }: any) => db.claims.filter((x) => matches(x, where))),
      deleteMany: jest.fn(async ({ where }: any) => {
        db.log.push('claims:delete');
        db.claims = db.claims.filter((x) => !matches(x, where));
      }),
      createMany: jest.fn(async ({ data }: any) => {
        for (const c of data) db.claims.push({ id: uid(), ...c });
      }),
    },
    groupExpenseShare: {
      deleteMany: jest.fn(async ({ where }: any) => {
        db.shares = db.shares.filter((x) => !matches(x, where));
      }),
      createMany: jest.fn(async ({ data }: any) => {
        for (const s of data) db.shares.push({ id: uid(), ...s });
      }),
    },
    groupSettlement: {
      findMany: jest.fn(async ({ where }: any) => db.settlements.filter((x) => matches(x, where))),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    },
    groupMemberEvent: { findMany: jest.fn(async () => []) },
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  return prisma;
}

const sharesOf = (db: ReturnType<typeof makeDb>, id = E): Record<string, number> =>
  Object.fromEntries(db.shares.filter((s) => s.groupExpenseId === id).map((s) => [s.memberId, Number(s.shareAmount)]));

describe('GroupItemsService (ABA-655)', () => {
  let db: ReturnType<typeof makeDb>;
  let prisma: any;
  let groups: GroupsService;
  let items: GroupItemsService;
  let notifications: any;
  let cache: any;

  beforeEach(() => {
    db = makeDb();
    prisma = makePrisma(db);
    notifications = { sendToUser: jest.fn(async () => true) };
    groups = new GroupsService(prisma, { setIfAbsent: jest.fn(async () => true) } as any, notifications, { getRates: jest.fn() } as any);
    cache = { incrementWindow: jest.fn(async () => 1), setIfAbsent: jest.fn(async () => true) };
    items = new GroupItemsService(prisma, groups, cache);
  });

  describe('while the window is open', () => {
    it('any live member claims their own lines; shares are re-derived and the ledger bumped in one transaction', async () => {
      const view = await items.setMyClaims(G, ANN, E, [I1, I2], { strict: true });
      expect(sharesOf(db)).toEqual({ [ANN]: 70, [PAYER]: 30 });
      expect(db.groups[0].ledgerVersion).toBe(6);
      expect(view.items.find((i) => i.id === I1)?.myPart).toBe(40);
      expect(view.claimsOpen).toBe(true);
      expect(view.canManageClaims).toBe(false);
      // The expense row's lock is taken before the claims are touched, inside the transaction.
      expect(db.log.indexOf(`lock:${E}`)).toBeLessThan(db.log.indexOf('claims:delete'));
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('a shared line is split between its claimants; the ledger sums to the expense total', async () => {
      await items.setMyClaims(G, ANN, E, [I1, I2]);
      await items.setMyClaims(G, BO, E, [I2]);
      const s = sharesOf(db);
      expect(s).toEqual({ [ANN]: 55, [BO]: 15, [PAYER]: 30 });
      expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(100);
      const ledger = computeGroupLedger(
        db.members.filter((m) => m.groupId === G).map((m) => ({ id: m.id as string })),
        [{ id: E, paidByMemberId: PAYER, amount: 100, shares: Object.entries(s).map(([memberId, shareAmount]) => ({ memberId, shareAmount })) }],
        [],
      );
      expect(ledger.balances.reduce((a, b) => a + b.netAmount, 0)).toBeCloseTo(0, 6);
    });

    it('a no-op change writes no ledger (no bump, no share rewrite)', async () => {
      await items.setMyClaims(G, ANN, E, [I1]);
      const v = db.groups[0].ledgerVersion;
      await items.setMyClaims(G, ANN, E, [I1]);
      expect(db.groups[0].ledgerVersion).toBe(v);
    });

    it('pushes only to app users whose share moved, never the actor', async () => {
      await items.setMyClaims(G, BO, E, [I3]);
      await new Promise((r) => setImmediate(r));
      const recipients = notifications.sendToUser.mock.calls.map((c: any[]) => c[0]);
      expect(recipients).toEqual(['u-payer']); // Pat's share moved; Bo is the actor; Olga's did not move
    });
  });

  describe('the lock rule', () => {
    const expire = () => (db.expenses[0].claimsOpenUntil = new Date(Date.now() - 1000));

    it('after 7 days a member’s self-claim is 409 CLAIMS_CLOSED and nothing is written', async () => {
      expire();
      const err = await items.setMyClaims(G, ANN, E, [I1]).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse().code).toBe('CLAIMS_CLOSED');
      expect(db.claims).toEqual([]);
      expect(db.groups[0].ledgerVersion).toBe(5);
    });

    it('after the window the payer, creator and owner still edit anyone’s claims and shares', async () => {
      expire();
      await items.setClaims(G, PAYER, E, [{ memberId: ANN, itemIds: [I1], shareBp: { [I1]: 5000 } }]);
      expect(sharesOf(db)).toEqual({ [ANN]: 20, [PAYER]: 80 });
      await items.setClaims(G, OWNER, E, [{ memberId: BO, itemIds: [I2] }]);
      expect(sharesOf(db)[BO]).toBe(30);
      await items.setMyClaims(G, PAYER, E, [I3]); // a manager may self-claim after the window too
      expect(db.claims.some((c) => c.memberId === PAYER && c.itemId === I3)).toBe(true);
    });

    it('only the payer, creator or owner sets other people’s claims, at any time', async () => {
      await expect(items.setClaims(G, ANN, E, [{ memberId: BO, itemIds: [I1] }])).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('the payer closes early; then members are refused until a reopen gives another 7 days', async () => {
      await expect(items.closeClaims(G, ANN, E, false)).rejects.toBeInstanceOf(ForbiddenException);
      const closed = await items.closeClaims(G, PAYER, E, false);
      expect(closed.claimsOpen).toBe(false);
      expect(db.groups[0].ledgerVersion).toBe(5); // closing moves no money
      await expect(items.setMyClaims(G, ANN, E, [I1])).rejects.toBeInstanceOf(ConflictException);
      const reopened = await items.closeClaims(G, OWNER, E, true);
      expect(reopened.claimsOpen).toBe(true);
      expect(new Date(reopened.claimsOpenUntil!).getTime()).toBeGreaterThan(Date.now() + CLAIM_WINDOW_MS - 60_000);
      await items.setMyClaims(G, ANN, E, [I1]);
      expect(sharesOf(db)[ANN]).toBe(40);
    });

    it('a share over 100% of a line, or on a line the member does not claim, is refused', async () => {
      await items.setClaims(G, PAYER, E, [{ memberId: ANN, itemIds: [I1], shareBp: { [I1]: 6000 } }]);
      await expect(
        items.setClaims(G, PAYER, E, [{ memberId: BO, itemIds: [I1], shareBp: { [I1]: 4001 } }]),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        items.setClaims(G, PAYER, E, [{ memberId: BO, itemIds: [I1], shareBp: { [I2]: 100 } }]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('settlements are never touched', () => {
    it('a claim change after a settlement leaves it intact and simply reopens a balance', async () => {
      await items.setMyClaims(G, ANN, E, [I1]); // Ann owes Pat 40
      db.settlements.push({ id: 'st1', groupId: G, fromMemberId: ANN, toMemberId: PAYER, amount: 40, voidedAt: null });
      let state = await groups.loadState(G);
      expect(state.ledger.balances.find((b) => b.memberId === ANN)?.netAmount).toBe(0);

      await items.setMyClaims(G, ANN, E, [I1, I2]); // she had the wine too
      for (const fn of ['update', 'updateMany', 'delete', 'create']) expect(prisma.groupSettlement[fn]).not.toHaveBeenCalled();
      expect(db.settlements[0]).toMatchObject({ amount: 40, voidedAt: null });
      state = await groups.loadState(G);
      expect(state.ledger.balances.find((b) => b.memberId === ANN)?.netAmount).toBe(-30);
      expect(state.hasOpenItemClaims).toBe(true);
    });
  });

  describe('IDOR: every id re-scoped', () => {
    it('another group’s expense is a 404 on every route', async () => {
      await expect(items.getItems(G, ANN, E_FOREIGN)).rejects.toBeInstanceOf(NotFoundException);
      await expect(items.setMyClaims(G, ANN, E_FOREIGN, [I_FOREIGN])).rejects.toBeInstanceOf(NotFoundException);
      await expect(items.setClaims(G, PAYER, E_FOREIGN, [{ memberId: ANN, itemIds: [] }])).rejects.toBeInstanceOf(NotFoundException);
      await expect(items.closeClaims(G, PAYER, E_FOREIGN, false)).rejects.toBeInstanceOf(NotFoundException);
      expect(db.claims).toEqual([]);
    });

    it('a foreign item id is a 404 in the app and silently ignored on the guest path', async () => {
      await expect(items.setMyClaims(G, ANN, E, [I1, I_FOREIGN], { strict: true })).rejects.toBeInstanceOf(NotFoundException);
      expect(db.claims).toEqual([]);
      await items.setMyClaims(G, ANN, E, [I1, I_FOREIGN], { scope: [I1, I_FOREIGN], strict: false });
      expect(db.claims.map((c) => c.itemId)).toEqual([I1]);
    });

    it('a member of another group cannot be given claims', async () => {
      await expect(items.setClaims(G, PAYER, E, [{ memberId: STRANGER, itemIds: [I1] }])).rejects.toBeInstanceOf(NotFoundException);
      expect(db.claims).toEqual([]);
    });

    it('a member of another group cannot act on this one', async () => {
      await expect(items.setMyClaims(G, STRANGER, E, [I1])).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('itemised expenses through GroupsService', () => {
    const base = { clientRequestId: 'req-00000001', description: 'Biedronka', date: '2026-10-09', paidByMemberId: PAYER };

    it('creates an itemised expense: payer holds everything, claims open for 7 days, exact split stored', async () => {
      const before = Date.now();
      await groups.createExpense(G, PAYER, { ...base, amount: 52.5, items: [{ name: 'Milk', totalPrice: 20 }, { name: 'Eggs', totalPrice: 30 }] });
      const e = db.expenses[db.expenses.length - 1];
      expect(e).toMatchObject({ itemized: true, splitType: 'exact', amount: 52.5, discountAmount: null });
      expect(new Date(e.claimsOpenUntil).getTime()).toBeGreaterThanOrEqual(before + CLAIM_WINDOW_MS);
      expect(sharesOf(db, e.id)).toEqual({ [PAYER]: 52.5 });
      expect(db.items.filter((i) => i.groupExpenseId === e.id).map((i) => i.position)).toEqual([0, 1]);
      expect(db.groups[0].ledgerVersion).toBe(6);
    });

    it('refuses lines that do not fit the amount, and splitType/shares beside items', async () => {
      await expect(groups.createExpense(G, PAYER, { ...base, amount: 10, items: [{ name: 'A', totalPrice: 11 }] })).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        groups.createExpense(G, PAYER, { ...base, amount: 10, items: [{ name: 'A', totalPrice: 5 }], splitType: 'equal', shares: [{ memberId: PAYER }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(groups.createExpense(G, PAYER, { ...base, amount: 10, splitType: 'equal', shares: [{ memberId: PAYER }], discountAmount: 1 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('a foreign-currency itemised expense: lines in EUR, shares in PLN summing to the stored amount', async () => {
      await groups.createExpense(G, PAYER, {
        ...base,
        amount: 30,
        currencyCode: 'EUR',
        fxRate: 4.3,
        items: [{ name: 'A', totalPrice: 10 }, { name: 'B', totalPrice: 10 }, { name: 'C', totalPrice: 10 }],
      });
      const e = db.expenses[db.expenses.length - 1];
      expect(e).toMatchObject({ amount: 129, originalAmount: 30, originalCurrency: 'EUR' });
      const lines = db.items.filter((i) => i.groupExpenseId === e.id);
      await items.setMyClaims(G, ANN, e.id, [lines[0].id]);
      await items.setMyClaims(G, BO, e.id, [lines[0].id, lines[1].id]);
      const s = sharesOf(db, e.id);
      expect(Math.round(Object.values(s).reduce((a, b) => a + b, 0) * 100)).toBe(12900);
      expect(s[ANN]).toBe(21.5); // 5 EUR of 30 -> 1/6 of 129
      const view = await items.getItems(G, BO, e.id);
      expect(view.itemCurrency).toBe('EUR');
      expect(view.items[1].myPart).toBe(10);
    });

    it('editing an itemised expense refuses splitType/shares, prunes a removed line’s claims and re-derives', async () => {
      await items.setMyClaims(G, ANN, E, [I1, I2]);
      await expect(groups.updateExpense(G, PAYER, E, { splitType: 'equal' })).rejects.toBeInstanceOf(BadRequestException);
      await groups.updateExpense(G, PAYER, E, {
        items: [
          { id: I1, name: 'Pizza', totalPrice: 40 },
          { name: 'Beer', totalPrice: 10 },
        ],
      });
      expect(db.claims.map((c) => c.itemId)).toEqual([I1]); // the wine and its claim are gone from storage
      expect(sharesOf(db)).toEqual({ [ANN]: 40, [PAYER]: 60 });
      await expect(
        groups.updateExpense(G, PAYER, E, { items: [{ id: I_FOREIGN, name: 'X', totalPrice: 1 }] }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(groups.updateExpense(G, PAYER, E, { amount: 10 })).rejects.toBeInstanceOf(BadRequestException); // lines exceed it
    });

    it('a non-itemised expense refuses items on edit', async () => {
      db.expenses[0].itemized = false;
      await expect(groups.updateExpense(G, PAYER, E, { items: [{ name: 'A', totalPrice: 1 }] })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('GroupDetail warns while a receipt is open and stops once it is closed or the group is archived', async () => {
      expect((await groups.getDetail(G, ANN)).hasOpenItemClaims).toBe(true);
      await items.closeClaims(G, PAYER, E, false);
      expect((await groups.getDetail(G, ANN)).hasOpenItemClaims).toBe(false);
      await items.closeClaims(G, PAYER, E, true);
      db.groups[0].status = 'archived';
      expect((await groups.getDetail(G, ANN)).hasOpenItemClaims).toBe(false);
    });
  });

  describe('security review (ABA-655 H1, M1, M3, M4)', () => {
    it('H1: removeMember is 409 MEMBER_HAS_OPEN_CLAIMS while the member holds claims on an open receipt, under the expense lock', async () => {
      await items.setMyClaims(G, ANN, E, [I1]);
      db.settlements.push({ id: 'st1', groupId: G, fromMemberId: ANN, toMemberId: PAYER, amount: 40, voidedAt: null }); // balance 0
      db.log.length = 0;
      const err: any = await groups.removeMember(G, OWNER, ANN).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse().code).toBe('MEMBER_HAS_OPEN_CLAIMS');
      expect(db.members.find((m) => m.id === ANN)!.removedAt).toBeNull();
      expect(db.log).toContain(`lock:${E}`);
      expect(db.log).not.toContain(`member:${ANN}`);

      await items.setMyClaims(G, ANN, E, []); // released
      db.settlements.length = 0;
      await groups.removeMember(G, OWNER, ANN);
      expect(db.members.find((m) => m.id === ANN)!.removedAt).not.toBeNull();
    });

    it('H1: claims on a closed receipt do not block removal', async () => {
      await items.setMyClaims(G, ANN, E, [I1]);
      db.settlements.push({ id: 'st1', groupId: G, fromMemberId: ANN, toMemberId: PAYER, amount: 40, voidedAt: null });
      db.expenses[0].claimsOpenUntil = new Date(Date.now() - 1000);
      await groups.removeMember(G, OWNER, ANN);
      expect(db.members.find((m) => m.id === ANN)!.removedAt).not.toBeNull();
    });

    it('H1: a removed member’s stale claims are unclaimed, so they cannot dilute or move shares', async () => {
      db.claims.push({ id: 'c1', itemId: I1, memberId: ANN, shareBp: null });
      db.members.find((m) => m.id === ANN)!.removedAt = new Date();
      await items.setMyClaims(G, BO, E, [I1]);
      expect(sharesOf(db)).toEqual({ [BO]: 40, [PAYER]: 60 }); // Bo has the whole pizza, not half
      expect(db.claims.some((c) => c.memberId === ANN)).toBe(false); // pruned in storage
      const view = await items.getItems(G, BO, E);
      expect(view.items[0].claims.map((c) => c.memberId)).toEqual([BO]);
    });

    it('H1: a manager cannot revive a removed member’s claim, and the guest page shows it as unclaimed', async () => {
      db.claims.push({ id: 'c1', itemId: I1, memberId: ANN, shareBp: null });
      db.members.find((m) => m.id === ANN)!.removedAt = new Date();
      await expect(items.setClaims(G, PAYER, E, [{ memberId: ANN, itemIds: [I1] }])).rejects.toBeInstanceOf(NotFoundException);
      const open = await items.listOpenForGuest(G, BO);
      expect(open[0].lines.every((l) => l.claimants === 0)).toBe(true);
    });

    it('H1: a member removed while their claim waited on the lock is refused inside the transaction', async () => {
      const actor = await groups.resolveActor(G, ANN);
      jest.spyOn(groups, 'resolveActor').mockResolvedValue(actor); // resolved as live before the removal committed
      db.members.find((m) => m.id === ANN)!.removedAt = new Date();
      await expect(items.setMyClaims(G, ANN, E, [I1])).rejects.toBeInstanceOf(NotFoundException);
      expect(db.claims).toEqual([]);
      expect(db.groups[0].ledgerVersion).toBe(5);
    });

    it('M1: the 11th claim change per member per expense in an hour is 429 and writes nothing', async () => {
      cache.incrementWindow.mockImplementation(async (key: string) => (key === `grp:claim:${E}:${ANN}` ? 11 : 1));
      const err: any = await items.setMyClaims(G, ANN, E, [I1]).catch((e) => e);
      expect(err.getStatus()).toBe(429);
      expect(err.getResponse().code).toBe('CLAIMS_BUSY');
      expect(db.claims).toEqual([]);
      await items.setMyClaims(G, BO, E, [I1]); // someone else's bucket is untouched
      expect(db.claims.length).toBe(1);
      expect(cache.incrementWindow).toHaveBeenCalledWith(`grp:claim:${E}:${ANN}`, 3_600_000);
    });

    it('M1: the manager route is charged too, and a Redis outage fails closed (503), never open', async () => {
      await items.setClaims(G, PAYER, E, [{ memberId: ANN, itemIds: [I1] }]);
      expect(cache.incrementWindow).toHaveBeenCalledWith(`grp:claim:${E}:${PAYER}`, 3_600_000);
      cache.incrementWindow.mockRejectedValue(new Error('redis down'));
      const err: any = await items.setMyClaims(G, BO, E, [I2]).catch((e) => e);
      expect(err.getStatus()).toBe(503);
      expect(db.claims.some((c) => c.memberId === BO)).toBe(false);
    });

    it('M3: closeClaims takes the expense row lock inside a transaction before changing the window', async () => {
      db.log.length = 0;
      prisma.groupExpense.updateMany.mockImplementationOnce(async () => {
        db.log.push('window');
        return { count: 1 };
      });
      await items.closeClaims(G, PAYER, E, false);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(db.log.indexOf(`lock:${E}`)).toBeGreaterThanOrEqual(0);
      expect(db.log.indexOf(`lock:${E}`)).toBeLessThan(db.log.indexOf('window'));
    });

    it('M4: an edit that lost the lock race to a delete is 404 and never revives the expense', async () => {
      const lock = prisma.groupExpense.update.getMockImplementation()!;
      prisma.groupExpense.update.mockImplementationOnce(async (args: any) => {
        db.expenses[0].deletedAt = new Date(); // the delete committed while we waited for the lock
        return lock(args);
      });
      await expect(groups.updateExpense(G, PAYER, E, { items: [{ id: I1, name: 'Pizza', totalPrice: 40 }] })).rejects.toBeInstanceOf(NotFoundException);
      expect(db.expenses[0].deletedAt).not.toBeNull();
      expect(db.groups[0].ledgerVersion).toBe(5);
      expect(db.log.some((l) => l === `update:${E}`)).toBe(false);
    });

    it('M4: the edit is applied on the row as it is under the lock, not the stale pre-lock read', async () => {
      await items.setMyClaims(G, ANN, E, [I1]);
      const lock = prisma.groupExpense.update.getMockImplementation()!;
      prisma.groupExpense.update.mockImplementationOnce(async (args: any) => {
        db.expenses[0].description = 'Renamed meanwhile';
        return lock(args);
      });
      await groups.updateExpense(G, PAYER, E, { items: [{ id: I1, name: 'Pizza', totalPrice: 40 }, { id: I2, name: 'Wine', totalPrice: 30 }] });
      expect(db.expenses[0].description).toBe('Renamed meanwhile');
    });
  });
});

describe('guest claim form (ABA-655)', () => {
  let db: ReturnType<typeof makeDb>;
  let prisma: any;
  let cache: any;
  let groups: GroupsService;
  let items: GroupItemsService;
  let controller: GroupGuestController;

  const mkRes = () => {
    const res: any = { headers: {} };
    res.set = jest.fn((h: Record<string, string>) => Object.assign(res.headers, h) && res);
    res.append = jest.fn(() => res);
    res.status = jest.fn((s: number) => ((res.statusCode = s), res));
    res.type = jest.fn(() => res);
    res.send = jest.fn((b: string) => ((res.body = b), res));
    res.redirect = jest.fn((s: number, u: string) => ((res.statusCode = s), (res.location = u), res));
    return res;
  };
  const mkReq = (cookie = `abg_m=${ANN_SECRET}`) => ({ headers: { cookie, 'user-agent': 'Mozilla' }, query: {} }) as any;
  const csrf = () => csrfFor(ANN_SECRET);
  const page = async () => {
    const res = mkRes();
    await controller.page(TOKEN, undefined, undefined, mkReq(), res);
    return res.body as string;
  };

  beforeEach(() => {
    db = makeDb();
    db.items[0].name = '<script>alert(1)</script> & "Pizza"';
    prisma = makePrisma(db);
    prisma.groupExpense.findMany = jest.fn(async ({ where, include, take }: any) => {
      const rows = db.expenses.filter((x) => matches(x, where));
      const withInc = rows.map((e) => {
        const out: Row = { ...e, shares: db.shares.filter((s) => s.groupExpenseId === e.id) };
        if (include?.items) {
          out.items = db.items
            .filter((i) => i.groupExpenseId === e.id)
            .map((i) => ({ ...i, claims: db.claims.filter((c) => c.itemId === i.id) }));
        }
        return out;
      });
      return take ? withInc.slice(0, take) : withInc;
    });
    cache = { incrementWindow: jest.fn(async () => 1), setIfAbsent: jest.fn(async () => true) };
    groups = new GroupsService(prisma, cache, { sendToUser: jest.fn() } as any, { getRates: jest.fn() } as any);
    items = new GroupItemsService(prisma, groups, cache);
    controller = new GroupGuestController(new GroupGuestService(prisma, cache, groups, items));
  });

  it('renders one checkbox + hidden l_ key per line, the CSRF field, escaped item names, and the settle note', async () => {
    const html = await page();
    expect(html).toContain(`action="/g/${TOKEN}/expenses/${E}/claims?lang=en"`);
    for (const id of [I1, I2, I3]) {
      expect(html).toContain(`name="l_${id}" value="1"`);
      expect(html).toContain(`name="c_${id}" value="1"`);
    }
    expect(html).toContain(`name="csrf" value="${csrf()}"`);
    expect(html).not.toContain('<script>');
    expect(html).toContain(escapeHtml('<script>alert(1)</script> & "Pizza"'));
    expect(html).toContain('Some receipts are still being divided');
    expect(html).not.toContain(I_FOREIGN); // another group's receipt never renders
  });

  it('a hand-split line is read-only: no checkbox and no l_ key, so a submit cannot touch it', async () => {
    db.claims.push({ id: 'c1', itemId: I2, memberId: BO, shareBp: 6000 });
    const html = await page();
    expect(html).not.toContain(`name="l_${I2}"`);
    expect(html).not.toContain(`name="c_${I2}"`);
    expect(html).toContain('split by Pat');
  });

  it('POST: unchecked differs from not shown; a planted foreign id is ignored; 303 with flash claimed', async () => {
    db.claims.push({ id: 'c0', itemId: I3, memberId: ANN, shareBp: null }); // claimed earlier, not on this form
    db.claims.push({ id: 'c00', itemId: I2, memberId: ANN, shareBp: null }); // on the form, now unticked
    const res = mkRes();
    await controller.claimItems(
      TOKEN,
      E,
      { csrf: csrf(), [`l_${I1}`]: '1', [`c_${I1}`]: '1', [`l_${I2}`]: '1', [`l_${I_FOREIGN}`]: '1', [`c_${I_FOREIGN}`]: '1', 'c_not-a-uuid': '1' },
      mkReq(),
      res,
    );
    expect(res.statusCode).toBe(303);
    expect(res.location).toBe(`/g/${TOKEN}?lang=en&f=claimed`);
    expect(res.headers['Referrer-Policy']).toBe('same-origin');
    const mine = db.claims.filter((c) => c.memberId === ANN).map((c) => c.itemId).sort();
    expect(mine).toEqual([I1, I3].sort());
    expect(db.claims.some((c) => c.itemId === I_FOREIGN)).toBe(false);
  });

  it('a crafted POST naming a hand-split line cannot drop or add a claim on it', async () => {
    db.claims.push({ id: 'h1', itemId: I2, memberId: ANN, shareBp: 6000 });
    const res = mkRes();
    await controller.claimItems(TOKEN, E, { csrf: csrf(), [`l_${I2}`]: '1', [`l_${I1}`]: '1', [`c_${I1}`]: '1' }, mkReq(), res);
    expect(db.claims.filter((c) => c.memberId === ANN).map((c) => [c.itemId, c.shareBp]).sort()).toEqual(
      [[I1, null], [I2, 6000]].sort(),
    );
  });

  it('a missing or wrong CSRF field writes nothing and spends no write ceiling', async () => {
    for (const body of [{ [`l_${I1}`]: '1', [`c_${I1}`]: '1' }, { csrf: 'x'.repeat(64), [`l_${I1}`]: '1', [`c_${I1}`]: '1' }]) {
      const res = mkRes();
      await controller.claimItems(TOKEN, E, body, mkReq(), res);
      expect(res.statusCode).toBe(303);
    }
    expect(db.claims).toEqual([]);
    expect(cache.incrementWindow).not.toHaveBeenCalled();
  });

  it('no cookie identity writes nothing (the actor never comes from a form field)', async () => {
    const res = mkRes();
    await controller.claimItems(TOKEN, E, { csrf: csrf(), memberId: ANN, [`l_${I1}`]: '1', [`c_${I1}`]: '1' }, mkReq('abg_m=' + 'c'.repeat(32)), res);
    expect(db.claims).toEqual([]);
  });

  it('a closed receipt answers flash claimsclosed; an archived group refuses before any write', async () => {
    db.expenses[0].claimsOpenUntil = new Date(Date.now() - 1);
    const res = mkRes();
    await controller.claimItems(TOKEN, E, { csrf: csrf(), [`l_${I1}`]: '1', [`c_${I1}`]: '1' }, mkReq(), res);
    expect(res.location).toBe(`/g/${TOKEN}?lang=en&f=claimsclosed`);
    expect(db.claims).toEqual([]);
    expect(await page()).not.toContain(`/expenses/${E}/claims`); // closed receipts are not offered

    db.expenses[0].claimsOpenUntil = new Date(Date.now() + CLAIM_WINDOW_MS);
    db.groups[0].status = 'archived';
    const res2 = mkRes();
    await controller.claimItems(TOKEN, E, { csrf: csrf(), [`l_${I1}`]: '1', [`c_${I1}`]: '1' }, mkReq(), res2);
    expect(res2.location).toBe(`/g/${TOKEN}?lang=en&f=forbidden`);
    expect(db.claims).toEqual([]);
  });

  it('another group’s expense id through this token is a silent no-op', async () => {
    const res = mkRes();
    await controller.claimItems(TOKEN, E_FOREIGN, { csrf: csrf(), [`l_${I_FOREIGN}`]: '1', [`c_${I_FOREIGN}`]: '1' }, mkReq(), res);
    expect(res.location).toBe(`/g/${TOKEN}?lang=en`);
    expect(db.claims).toEqual([]);
  });

  it('M1: a member over the per-expense claim ceiling gets flash busy and nothing is written', async () => {
    cache.incrementWindow.mockImplementation(async (key: string) => (key.startsWith('grp:claim:') ? 11 : 1));
    const res = mkRes();
    await controller.claimItems(TOKEN, E, { csrf: csrf(), [`l_${I1}`]: '1', [`c_${I1}`]: '1' }, mkReq(), res);
    expect(res.location).toBe(`/g/${TOKEN}?lang=en&f=busy`);
    expect(db.claims).toEqual([]);
  });

  it('the guest claim route is throttled per route (no APP_GUARD exists)', () => {
    const proto = GroupGuestController.prototype as any;
    expect(Reflect.getMetadata('__guards__', proto.claimItems)).toContain(ThrottlerGuard);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', proto.claimItems)).toBe(10);
  });
});
