import 'reflect-metadata';
import { createHash } from 'crypto';
import { GoneException, ConflictException } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { GroupGuestController, GROUP_GUEST_CSP } from './group-guest.controller';
import {
  buildSetCookie,
  csrfFor,
  GroupGuestService,
  isTrustedRequestOrigin,
  readCookie,
  sha256Hex,
  verifyCsrf,
} from './group-guest.service';
import { GroupsService } from './groups.service';
import { escapeHtml } from '../receipt-split/helpers/guest-page';

const TOKEN = 'a'.repeat(32);
const G = 'g-1';
const A = 'm-ann'; // the cookie holder (a guest)
const B = 'm-bob'; // a guest placeholder, unclaimed
const C = 'm-cat'; // an app user, SENTINEL userId
const SECRET = 'b'.repeat(32);
const SECRET_HASH = sha256Hex(SECRET);
const RID = 'rid-0123456789';

function mkMember(id: string, over: any = {}) {
  return {
    id,
    groupId: G,
    userId: null,
    displayName: id,
    nameKey: id,
    claimTokenHash: null,
    claimedAt: null,
    paymentMethod: null,
    paymentHandle: null,
    removedAt: null,
    createdAt: new Date('2026-01-01'),
    ...over,
  };
}

function mkRes() {
  const res: any = { headers: {} as Record<string, string>, cookies: [] as string[] };
  res.set = jest.fn((h: Record<string, string>) => {
    Object.assign(res.headers, h);
    return res;
  });
  res.append = jest.fn((k: string, v: string) => {
    if (k === 'Set-Cookie') res.cookies.push(v);
    return res;
  });
  res.status = jest.fn((s: number) => {
    res.statusCode = s;
    return res;
  });
  res.type = jest.fn(() => res);
  res.send = jest.fn((b: string) => {
    res.body = b;
    return res;
  });
  res.redirect = jest.fn((s: number, u: string) => {
    res.statusCode = s;
    res.location = u;
    return res;
  });
  return res;
}

function mkReq(over: any = {}) {
  return { headers: { cookie: `abg_m=${SECRET}`, 'user-agent': 'Mozilla Desktop' }, query: {}, ...over };
}

describe('GroupGuestController', () => {
  let prisma: any;
  let cache: any;
  let controller: GroupGuestController;
  let groups: GroupsService;
  let svc: GroupGuestService;
  let group: any;
  let members: any[];
  let expenses: any[];
  let settlements: any[];

  const csrf = () => csrfFor(SECRET);

  beforeEach(() => {
    group = {
      id: G,
      guestToken: TOKEN,
      name: 'Flat',
      emoji: null,
      currencyCode: 'PLN',
      ownerUserId: 'SENTINEL-OWNER-USER',
      guestAccess: true,
      status: 'active',
      ledgerVersion: 3,
    };
    members = [
      mkMember(A, { claimTokenHash: SECRET_HASH, claimedAt: new Date() }),
      mkMember(B),
      mkMember(C, { userId: 'SENTINEL-USER-ID', displayName: 'Cat', claimTokenHash: 'x'.repeat(64) }),
    ];
    // Cat paid 90, split equally: Ann owes Cat 30, Bob owes Cat 30.
    expenses = [
      {
        id: 'e1',
        groupId: G,
        description: 'Groceries',
        paidByMemberId: C,
        createdByMemberId: C,
        splitType: 'equal',
        amount: 90,
        date: new Date('2026-01-10'),
        createdAt: new Date('2026-01-10'),
        updatedAt: new Date('2026-01-10'),
        deletedAt: null,
        shares: [
          { memberId: A, shareAmount: 30 },
          { memberId: B, shareAmount: 30 },
          { memberId: C, shareAmount: 30 },
        ],
      },
    ];
    settlements = [];

    const live = (where: any) => members.filter((m) => where?.removedAt !== null || m.removedAt === null);
    prisma = {
      expenseGroup: {
        findUnique: jest.fn(async ({ where }: any) => {
          if (where.guestToken) return where.guestToken === TOKEN ? group : null;
          return where.id === G ? group : null;
        }),
        updateMany: jest.fn(async () => ({ count: 1 })),
        update: jest.fn(),
      },
      expenseGroupMember: {
        findFirst: jest.fn(async ({ where }: any) => {
          const m = members.find(
            (x) =>
              (where.id === undefined || x.id === where.id) &&
              (where.groupId === undefined || x.groupId === where.groupId) &&
              (where.claimTokenHash === undefined || x.claimTokenHash === where.claimTokenHash) &&
              (where.removedAt === undefined || x.removedAt === where.removedAt),
          );
          return m ? { ...m, group: { ownerUserId: group.ownerUserId } } : null;
        }),
        findMany: jest.fn(async ({ where }: any) => {
          if (where?.id?.in) return members.filter((m) => where.id.in.includes(m.id) && m.removedAt === null);
          return live(where);
        }),
        count: jest.fn(async () => members.length),
        create: jest.fn(async ({ data }: any) => ({ id: 'm-new', ...data })),
        updateMany: jest.fn(async () => ({ count: 1 })),
        update: jest.fn(async ({ where, data }: any) => ({ ...members.find((m) => m.id === where.id), ...data })),
      },
      groupExpense: {
        findMany: jest.fn(async () => expenses),
        findFirst: jest.fn(async ({ where }: any) =>
          expenses.find(
            (e) =>
              e.id === where.id &&
              e.groupId === where.groupId &&
              (where.createdByMemberId === undefined || e.createdByMemberId === where.createdByMemberId),
          ) ?? null,
        ),
        count: jest.fn(async () => expenses.length),
        create: jest.fn(),
        update: jest.fn(),
      },
      groupExpenseShare: { deleteMany: jest.fn() },
      groupSettlement: {
        findMany: jest.fn(async () => settlements),
        findFirst: jest.fn(async () => null),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    cache = {
      incrementWindow: jest.fn(async () => 1),
      setIfAbsent: jest.fn(async () => true),
      set: jest.fn(async () => undefined),
      get: jest.fn(async () => ({ groupId: G })),
      getAndDelete: jest.fn(),
    };
    groups = new GroupsService(prisma, cache, { sendToUser: jest.fn() } as any);
    svc = new GroupGuestService(prisma, cache, groups);
    controller = new GroupGuestController(svc);
  });

  // ------------------------------------------------------------- not found

  describe('not found', () => {
    it('is byte-identical for an unknown token, guestAccess=false and a deleted group', async () => {
      const bodies: string[] = [];
      const statuses: number[] = [];

      const r1 = mkRes();
      await controller.page('z'.repeat(32), undefined, undefined, mkReq() as any, r1);
      bodies.push(r1.body);
      statuses.push(r1.statusCode);

      group.guestAccess = false;
      const r2 = mkRes();
      await controller.page(TOKEN, undefined, undefined, mkReq() as any, r2);
      bodies.push(r2.body);
      statuses.push(r2.statusCode);

      group.guestAccess = true;
      prisma.expenseGroup.findUnique.mockResolvedValue(null); // hard-deleted
      const r3 = mkRes();
      await controller.page(TOKEN, undefined, undefined, mkReq() as any, r3);
      bodies.push(r3.body);
      statuses.push(r3.statusCode);

      expect(new Set(bodies).size).toBe(1);
      expect(new Set(statuses)).toEqual(new Set([404]));
      expect(bodies[0]).not.toContain(TOKEN);
    });

    it('answers every POST for an unusable token with the same page and writes nothing', async () => {
      group.guestAccess = false;
      const res = mkRes();
      await controller.addExpense(TOKEN, { csrf: csrf() }, mkReq() as any, res);
      const ref = mkRes();
      await controller.page('q'.repeat(32), undefined, undefined, mkReq() as any, ref);
      expect(res.body).toBe(ref.body);
      expect(prisma.groupExpense.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------- headers

  describe('page', () => {
    it('sets the strict headers and renders without userId / email / accountId leaks', async () => {
      const res = mkRes();
      await controller.page(TOKEN, undefined, undefined, mkReq() as any, res);
      expect(res.statusCode).toBe(200);
      expect(res.headers['Cache-Control']).toBe('no-store');
      expect(res.headers['X-Robots-Tag']).toBe('noindex');
      expect(res.headers['Referrer-Policy']).toBe('same-origin');
      expect(res.headers['Content-Security-Policy']).toBe(GROUP_GUEST_CSP);
      expect(GROUP_GUEST_CSP).toContain("default-src 'none'");
      expect(GROUP_GUEST_CSP).toContain("frame-ancestors 'none'");
      expect(res.body).toContain('<meta name="referrer" content="same-origin">');
      expect(res.body).not.toContain('<script');
      expect(res.body).not.toContain('SENTINEL');
      expect(res.body).not.toContain('isAppUser');
    });

    it('shows the picker (unclaimed names only) to a visitor with no cookie, and no write forms', async () => {
      const res = mkRes();
      await controller.page(TOKEN, undefined, undefined, mkReq({ headers: {} }) as any, res);
      expect(res.body).toContain(`value="${B}"`);
      expect(res.body).not.toContain(`value="${A}"`); // claimed
      expect(res.body).not.toContain(`value="${C}"`); // app user, claimed
      expect(res.body).not.toContain('name="csrf"');
      expect(res.body).not.toContain('/expenses?');
    });

    it('escapes a hostile member name and description', async () => {
      members[1].displayName = '<script>alert(1)</script>';
      expenses[0].description = '"><img src=x onerror=alert(1)>';
      const res = mkRes();
      await controller.page(TOKEN, undefined, undefined, mkReq() as any, res);
      expect(res.body).not.toContain('<script>alert');
      expect(res.body).not.toContain('<img src=x');
      expect(res.body).toContain(escapeHtml('<script>alert(1)</script>'));
    });

    it('uses .btn-cta for install prompts, never .btn-primary, and links no iOS store', async () => {
      const res = mkRes();
      await controller.page(TOKEN, 'added', 'added', mkReq() as any, res);
      expect(res.body).toContain('btn btn-cta');
      expect(res.body).toContain('https://app.ai-budget.pl/?src=group&amp;loc=added&amp;lang=en');
      expect(res.body).toContain('play.google.com');
      expect(res.body).not.toContain('btn-primary');
      expect(res.body).not.toMatch(/apps\.apple\.com|itunes\.apple\.com/);
      // The receipt prompt sits on the add-expense form.
      expect(res.body).toContain('loc=form');
    });

    it('renders an archived group read-only', async () => {
      group.status = 'archived';
      const res = mkRes();
      await controller.page(TOKEN, undefined, undefined, mkReq() as any, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain('name="description"');
      expect(res.body).not.toContain('/settle');
    });

    it('shows the creditor handle only on the payer row', async () => {
      members[2].paymentMethod = 'revolut';
      members[2].paymentHandle = 'catrev';
      const asAnn = mkRes();
      await controller.page(TOKEN, undefined, undefined, mkReq() as any, asAnn);
      expect(asAnn.body).toContain('catrev');
      const anon = mkRes();
      await controller.page(TOKEN, undefined, undefined, mkReq({ headers: {} }) as any, anon);
      expect(anon.body).not.toContain('catrev');
    });

    it('offers the Android deep-link button on an Android user agent only', async () => {
      const desktop = mkRes();
      await controller.page(TOKEN, undefined, undefined, mkReq() as any, desktop);
      expect(desktop.body).not.toContain('value="app"');
      const android = mkRes();
      await controller.page(
        TOKEN,
        undefined,
        undefined,
        mkReq({ headers: { cookie: `abg_m=${SECRET}`, 'user-agent': 'Mozilla/5.0 (Linux; Android 14)' } }) as any,
        android,
      );
      expect(android.body).toContain('value="app"');
    });
  });

  // ------------------------------------------------------------ cookies etc.

  describe('cookie and csrf helpers', () => {
    it('parses the Cookie header and ignores other cookies', () => {
      expect(readCookie(`x=1; abg_m=${SECRET}; y=2`, 'abg_m')).toBe(SECRET);
      expect(readCookie(undefined, 'abg_m')).toBeNull();
    });

    it('builds a path-scoped HttpOnly Secure SameSite=Lax 400-day cookie', () => {
      const c = buildSetCookie(TOKEN, SECRET);
      expect(c).toBe(`abg_m=${SECRET}; Path=/g/${TOKEN}; HttpOnly; Secure; SameSite=Lax; Max-Age=34560000`);
      expect(buildSetCookie(TOKEN, null)).toContain('Max-Age=0');
    });

    it('csrf is sha256(grp-csrf:secret), compared in constant time', () => {
      expect(csrfFor(SECRET)).toBe(createHash('sha256').update(`grp-csrf:${SECRET}`).digest('hex'));
      expect(verifyCsrf(SECRET, csrfFor(SECRET))).toBe(true);
      expect(verifyCsrf(SECRET, 'nope')).toBe(false);
      expect(verifyCsrf(SECRET, undefined)).toBe(false);
      expect(verifyCsrf(SECRET, csrfFor('c'.repeat(32)))).toBe(false);
    });
  });

  // ------------------------------------------------------------------- join

  describe('join', () => {
    it('claims a placeholder atomically, stores only the sha256 and sets the cookie', async () => {
      const res = mkRes();
      await controller.join(TOKEN, { memberId: B }, mkReq({ headers: {} }) as any, res);
      const call = prisma.expenseGroupMember.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: B, groupId: G, userId: null, claimTokenHash: null, removedAt: null });
      const secret = /abg_m=([a-f0-9]{32});/.exec(res.cookies[0])![1];
      expect(call.data.claimTokenHash).toBe(sha256Hex(secret));
      expect(JSON.stringify(call)).not.toContain(secret);
      expect(res.cookies[0]).toContain(`Path=/g/${TOKEN}`);
      expect(res.cookies[0]).toContain('HttpOnly; Secure; SameSite=Lax');
      expect(res.statusCode).toBe(303);
      expect(res.location).toContain(`/g/${TOKEN}?`);
      expect(res.location).toContain('f=joined');
    });

    it('the loser of a claim race gets "taken" and no cookie', async () => {
      prisma.expenseGroupMember.updateMany.mockResolvedValue({ count: 0 });
      const res = mkRes();
      await controller.join(TOKEN, { memberId: B }, mkReq({ headers: {} }) as any, res);
      expect(res.cookies).toHaveLength(0);
      expect(res.location).toContain('f=taken');
    });

    it('creates a new guest member by name, already claimed with the hash', async () => {
      const res = mkRes();
      await controller.join(TOKEN, { name: '  Dana ' }, mkReq({ headers: {} }) as any, res);
      const data = prisma.expenseGroupMember.create.mock.calls[0][0].data;
      expect(data.displayName).toBe('Dana');
      expect(data.userId).toBeNull();
      expect(data.claimTokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(res.cookies).toHaveLength(1);
    });

    it('refuses to join an archived group', async () => {
      group.status = 'archived';
      const res = mkRes();
      await controller.join(TOKEN, { memberId: B }, mkReq({ headers: {} }) as any, res);
      expect(prisma.expenseGroupMember.updateMany).not.toHaveBeenCalled();
      expect(res.cookies).toHaveLength(0);
    });

    it('device restore (POST body code) sets the cookie only for a code that hashes to a member of THIS group', async () => {
      const ok = mkRes();
      await controller.restore(TOKEN, { code: SECRET }, mkReq({ headers: {} }) as any, ok);
      expect(ok.cookies[0]).toContain(`abg_m=${SECRET}`);
      expect(ok.statusCode).toBe(303);
      const bad = mkRes();
      await controller.restore(TOKEN, { code: 'd'.repeat(32) }, mkReq({ headers: {} }) as any, bad);
      expect(bad.location).toContain('f=badcode');
      expect(bad.cookies).toHaveLength(0);
      const junk = mkRes();
      await controller.restore(TOKEN, { code: 'nope' }, mkReq({ headers: {} }) as any, junk);
      expect(junk.location).toContain('f=badcode');
      expect(junk.cookies).toHaveLength(0);
    });

    it('there is no GET restore route any more (the secret never travels in a URL path)', () => {
      const proto = GroupGuestController.prototype as any;
      const routes = Object.getOwnPropertyNames(proto)
        .filter((n) => n !== 'constructor')
        .map((n) => ({ path: Reflect.getMetadata('path', proto[n]), method: Reflect.getMetadata('method', proto[n]) }))
        .filter((r) => r.path !== undefined);
      expect(routes.some((r) => String(r.path).includes('/me/'))).toBe(false);
      const restore = routes.filter((r) => r.path === ':token/restore');
      expect(restore).toHaveLength(1);
      expect(restore[0].method).toBe(1); // RequestMethod.POST
      expect(Reflect.getMetadata('__guards__', proto.restore)).toContain(ThrottlerGuard);
      expect(Reflect.getMetadata('THROTTLER:LIMITdefault', proto.restore)).toBe(5);
    });

    describe('login-CSRF / session fixation (join + restore)', () => {
      const cases: [string, (req: any, res: any) => Promise<void>][] = [
        ['join', (req, res) => controller.join(TOKEN, { memberId: B }, req, res)],
        ['restore', (req, res) => controller.restore(TOKEN, { code: SECRET }, req, res)],
      ];
      it.each(cases)('%s refuses Sec-Fetch-Site: cross-site and sets no cookie', async (_n, call) => {
        const res = mkRes();
        await call(mkReq({ headers: { 'sec-fetch-site': 'cross-site' } }), res);
        expect(res.cookies).toHaveLength(0);
        expect(res.location).toContain('f=forbidden');
        expect(prisma.expenseGroupMember.updateMany).not.toHaveBeenCalled();
        expect(cache.incrementWindow).not.toHaveBeenCalled();
      });
      it.each(cases)('%s refuses a foreign Origin (and the opaque null origin)', async (_n, call) => {
        for (const origin of ['https://evil.example', 'null']) {
          const res = mkRes();
          await call(mkReq({ headers: { origin } }), res);
          expect(res.cookies).toHaveLength(0);
          expect(res.location).toContain('f=forbidden');
        }
      });
      it.each(cases)('%s accepts the API own origin and the request own Host', async (_n, call) => {
        for (const headers of [
          { origin: 'https://api.ai-budget.pl', 'sec-fetch-site': 'same-origin' },
          { origin: 'https://staging.example.test', host: 'staging.example.test' },
        ]) {
          const res = mkRes();
          await call(mkReq({ headers }), res);
          expect(res.location).not.toContain('f=forbidden');
          expect(res.cookies).toHaveLength(1);
        }
      });
      it.each(cases)('%s never replaces a cookie that already resolves to a live member', async (_n, call) => {
        const res = mkRes();
        await call(mkReq(), res); // default mkReq carries the live cookie for A
        expect(res.cookies).toHaveLength(0);
        expect(res.location).toContain('f=alreadyin');
        expect(prisma.expenseGroupMember.updateMany).not.toHaveBeenCalled();
        expect(prisma.expenseGroupMember.create).not.toHaveBeenCalled();
      });
      it('a stale cookie (no live member) may be replaced', async () => {
        const res = mkRes();
        await controller.join(
          TOKEN,
          { memberId: B },
          mkReq({ headers: { cookie: `abg_m=${'e'.repeat(32)}` } }) as any,
          res,
        );
        expect(res.cookies).toHaveLength(1);
        expect(res.location).toContain('f=joined');
      });
      it('isTrustedRequestOrigin: Sec-Fetch-Site decides when present, Origin only without it', () => {
        expect(isTrustedRequestOrigin({})).toBe(true);
        expect(isTrustedRequestOrigin({ 'sec-fetch-site': 'same-origin' })).toBe(true);
        expect(isTrustedRequestOrigin({ 'sec-fetch-site': 'cross-site' })).toBe(false);
        expect(isTrustedRequestOrigin({ 'sec-fetch-site': 'same-site' })).toBe(false);
        expect(isTrustedRequestOrigin({ 'sec-fetch-site': 'none' })).toBe(false);
        expect(isTrustedRequestOrigin({ origin: 'not a url' })).toBe(false);
      });
      // Regression (2026-10-09): a real browser on a page with a no-referrer policy POSTs its own
      // form with `Origin: null` + `Sec-Fetch-Site: same-origin`; every join was refused.
      it.each(cases)('%s accepts a same-origin POST that carries Origin: null', async (_n, call) => {
        const res = mkRes();
        await call(mkReq({ headers: { origin: 'null', 'sec-fetch-site': 'same-origin' } }), res);
        expect(res.location).not.toContain('f=forbidden');
        expect(res.cookies).toHaveLength(1);
      });
      it.each(cases)('%s still refuses a cross-site POST even with our own Origin', async (_n, call) => {
        const res = mkRes();
        await call(
          mkReq({ headers: { origin: 'https://api.ai-budget.pl', 'sec-fetch-site': 'cross-site' } }),
          res,
        );
        expect(res.location).toContain('f=forbidden');
        expect(res.cookies).toHaveLength(0);
      });
    });

    it('forget clears the cookie and this member claim', async () => {
      const res = mkRes();
      await controller.forget(TOKEN, { csrf: csrf() }, mkReq() as any, res);
      expect(prisma.expenseGroupMember.updateMany).toHaveBeenCalledWith({
        where: { id: A, groupId: G },
        data: { claimTokenHash: null, claimedAt: null },
      });
      expect(res.cookies[0]).toContain('Max-Age=0');
    });
  });

  // ----------------------------------------------------------------- writes

  describe('writes', () => {
    const expenseBody = (over: any = {}) => ({
      csrf: csrf(),
      rid: RID,
      description: 'Pizza',
      amount: '60,00',
      date: '2026-01-12',
      paidBy: A,
      splitType: 'equal',
      [`inc_${A}`]: '1',
      [`inc_${B}`]: '1',
      ...over,
    });

    it('refuses a write with no cookie (303, nothing written)', async () => {
      const spy = jest.spyOn(groups, 'createExpense');
      const res = mkRes();
      await controller.addExpense(TOKEN, expenseBody(), mkReq({ headers: {} }) as any, res);
      expect(res.statusCode).toBe(303);
      expect(spy).not.toHaveBeenCalled();
    });

    it('refuses a CSRF mismatch', async () => {
      const spy = jest.spyOn(groups, 'createExpense');
      const res = mkRes();
      await controller.addExpense(TOKEN, expenseBody({ csrf: csrfFor('e'.repeat(32)) }), mkReq() as any, res);
      expect(res.statusCode).toBe(303);
      expect(spy).not.toHaveBeenCalled();
      expect(cache.incrementWindow).not.toHaveBeenCalled();
    });

    it('takes the acting member from the cookie, never from a form field', async () => {
      const spy = jest.spyOn(groups, 'createExpense').mockResolvedValue({} as any);
      const res = mkRes();
      await controller.addExpense(
        TOKEN,
        expenseBody({ memberId: C, actingMemberId: C, createdByMemberId: C, userId: 'SENTINEL-USER-ID' }),
        mkReq() as any,
        res,
      );
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toBe(G);
      expect(spy.mock.calls[0][1]).toBe(A);
      expect(spy.mock.calls[0][2]).toMatchObject({ clientRequestId: RID, amount: 60, splitType: 'equal', paidByMemberId: A });
      expect(res.statusCode).toBe(303);
      expect(res.location).toContain('f=added');
      expect(res.location).toContain('cta=added');
    });

    it('ignores a foreign payer or share member id (silent no-op)', async () => {
      const spy = jest.spyOn(groups, 'createExpense');
      const res = mkRes();
      await controller.addExpense(TOKEN, expenseBody({ paidBy: 'm-foreign' }), mkReq() as any, res);
      expect(spy).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(303);

      // A planted foreign share key is never read: only live members of this group are iterated.
      const spy2 = jest.spyOn(groups, 'createExpense').mockResolvedValue({} as any);
      await controller.addExpense(TOKEN, expenseBody({ 'inc_m-foreign': '1' }), mkReq() as any, mkRes());
      const shares = spy2.mock.calls[0][2].shares.map((s) => s.memberId);
      expect(shares).toEqual([A, B]);
    });

    it('rejects an invalid amount / no shares as "invalid"', async () => {
      const res = mkRes();
      await controller.addExpense(TOKEN, expenseBody({ amount: '-5' }), mkReq() as any, res);
      expect(res.location).toContain('f=invalid');
      const res2 = mkRes();
      await controller.addExpense(TOKEN, expenseBody({ [`inc_${A}`]: undefined, [`inc_${B}`]: undefined }), mkReq() as any, res2);
      expect(res2.location).toContain('f=invalid');
    });

    it('rejects an archived group on every write', async () => {
      group.status = 'archived';
      const spy = jest.spyOn(groups, 'createExpense');
      const res = mkRes();
      await controller.addExpense(TOKEN, expenseBody(), mkReq() as any, res);
      expect(spy).not.toHaveBeenCalled();
      expect(res.location).toContain('f=forbidden');
    });

    it('a guest deletes only an expense they created', async () => {
      const spy = jest.spyOn(groups, 'deleteExpense').mockResolvedValue({} as any);
      // e1 was created by Cat, so for Ann the scoped lookup misses.
      const res = mkRes();
      await controller.deleteExpense(TOKEN, 'e1', { csrf: csrf() }, mkReq() as any, res);
      expect(prisma.groupExpense.findFirst.mock.calls[0][0].where).toMatchObject({
        id: 'e1',
        groupId: G,
        createdByMemberId: A,
      });
      expect(spy).not.toHaveBeenCalled();

      expenses[0].createdByMemberId = A;
      await controller.deleteExpense(TOKEN, 'e1', { csrf: csrf() }, mkReq() as any, mkRes());
      expect(spy).toHaveBeenCalledWith(G, A, 'e1');
    });

    it('a foreign expense id is a silent no-op', async () => {
      const spy = jest.spyOn(groups, 'deleteExpense');
      const res = mkRes();
      await controller.deleteExpense(TOKEN, 'e-other-group', { csrf: csrf() }, mkReq() as any, res);
      expect(spy).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(303);
      expect(res.location).not.toContain('f=');
    });

    it('a foreign settlement id cannot be voided', async () => {
      const spy = jest.spyOn(groups, 'voidSettlement');
      const res = mkRes();
      await controller.voidSettlement(TOKEN, 's-foreign', { csrf: csrf() }, mkReq() as any, res);
      expect(prisma.groupSettlement.findFirst.mock.calls[0][0].where).toMatchObject({
        id: 's-foreign',
        groupId: G,
        OR: [{ recordedByMemberId: A }, { toMemberId: A }],
      });
      expect(spy).not.toHaveBeenCalled();
    });

    describe('settle (reuses GroupsService validation + CAS)', () => {
      const body = (over: any = {}) => ({
        csrf: csrf(),
        rid: RID,
        fromMemberId: A,
        toMemberId: C,
        amount: '30.00',
        v: '3',
        ...over,
      });

      it('records a payment that matches a current suggested transfer', async () => {
        const res = mkRes();
        await controller.settle(TOKEN, body(), mkReq() as any, res);
        expect(prisma.groupSettlement.create).toHaveBeenCalledTimes(1);
        expect(prisma.groupSettlement.create.mock.calls[0][0].data).toMatchObject({
          groupId: G,
          fromMemberId: A,
          toMemberId: C,
          recordedByMemberId: A,
        });
        expect(prisma.expenseGroup.updateMany).toHaveBeenCalledWith({
          where: { id: G, ledgerVersion: 3 },
          data: { ledgerVersion: { increment: 1 } },
        });
        expect(res.location).toContain('cta=settled');
      });

      it('rejects a stale ledger version as "changed" without writing', async () => {
        const res = mkRes();
        await controller.settle(TOKEN, body({ v: '2' }), mkReq() as any, res);
        expect(res.location).toContain('f=changed');
        expect(prisma.groupSettlement.create).not.toHaveBeenCalled();
      });

      it('maps a lost CAS inside the transaction to "changed"', async () => {
        prisma.expenseGroup.updateMany.mockResolvedValue({ count: 0 });
        const res = mkRes();
        await controller.settle(TOKEN, body(), mkReq() as any, res);
        expect(res.location).toContain('f=changed');
        expect(prisma.groupSettlement.create).not.toHaveBeenCalled();
      });

      it('rejects an amount that matches no current transfer, before any write', async () => {
        const res = mkRes();
        await controller.settle(TOKEN, body({ amount: '5.00' }), mkReq() as any, res);
        expect(res.location).toContain('f=invalid');
        expect(prisma.groupSettlement.create).not.toHaveBeenCalled();
      });

      it('rejects a transfer the acting member is not part of', async () => {
        const res = mkRes();
        await controller.settle(TOKEN, body({ fromMemberId: B, toMemberId: C }), mkReq() as any, res);
        expect(res.location).toContain('f=forbidden');
        expect(prisma.groupSettlement.create).not.toHaveBeenCalled();
      });

      it('a foreign member id is a silent no-op', async () => {
        const res = mkRes();
        await controller.settle(TOKEN, body({ toMemberId: 'm-foreign' }), mkReq() as any, res);
        expect(res.location).not.toContain('f=');
        expect(prisma.groupSettlement.create).not.toHaveBeenCalled();
      });
    });

    it('payment info targets the acting member only (never a form field)', async () => {
      const spy = jest.spyOn(groups, 'updateMember').mockResolvedValue({} as any);
      const res = mkRes();
      await controller.paymentInfo(
        TOKEN,
        { csrf: csrf(), paymentMethod: 'revolut', paymentHandle: '@ann', memberId: C },
        mkReq() as any,
        res,
      );
      expect(spy).toHaveBeenCalledWith(G, A, A, { paymentMethod: 'revolut', paymentHandle: '@ann' });
      const bad = mkRes();
      await controller.paymentInfo(TOKEN, { csrf: csrf(), paymentMethod: 'bitcoin' }, mkReq() as any, bad);
      expect(bad.location).toContain('f=invalid');
    });
  });

  // ------------------------------------------------- page: restore code, added-by

  describe('guest page (restore code, added-by)', () => {
    it('shows the restore code (not a link) in a details box, only on the render right after joining', async () => {
      const res = mkRes();
      await controller.page(TOKEN, 'joined', undefined, mkReq() as any, res);
      expect(res.body).toContain('<details>');
      expect(res.body).toContain(`<div class="code">${SECRET}</div>`);
      expect(res.body).not.toContain('/me/');
      const later = mkRes();
      await controller.page(TOKEN, undefined, undefined, mkReq() as any, later);
      expect(later.body).not.toContain(SECRET);
    });

    it('the who-are-you picker carries a "Have a restore code?" POST form to /restore', async () => {
      const res = mkRes();
      await controller.page(TOKEN, undefined, undefined, mkReq({ headers: {} }) as any, res);
      expect(res.body).toContain(`action="/g/${TOKEN}/restore?lang=en"`);
      expect(res.body).toContain('Have a restore code?');
      expect(res.body).toContain('name="code"');
    });

    it('labels a row "added by X" only when the creator differs from the payer', async () => {
      expenses[0].createdByMemberId = A; // Cat paid, Ann entered it
      const res = mkRes();
      await controller.page(TOKEN, undefined, undefined, mkReq() as any, res);
      expect(res.body).toContain('added by m-ann');
      expenses[0].createdByMemberId = C; // creator == payer
      const same = mkRes();
      await controller.page(TOKEN, undefined, undefined, mkReq() as any, same);
      expect(same.body).not.toContain('added by');
    });

    it('every locale has the new copy (real translations, not the English fallback)', async () => {
      const keys = ['restoreSummary', 'restoreFormTitle', 'restoreCodeLabel', 'restoreButton', 'msgBadCode', 'msgAlreadyIn', 'expenseAddedBy'] as const;
      const { getGroupGuestStrings } = await import('./helpers/group-guest-page-i18n');
      const en = getGroupGuestStrings('en');
      for (const lang of ['pl', 'de', 'es', 'fr', 'ru', 'ua', 'be', 'nl']) {
        const t = getGroupGuestStrings(lang);
        for (const k of keys) {
          expect(t.t(k, 'X')).toBeTruthy();
          expect(t.t(k, 'X')).not.toBe(en.t(k, 'X'));
        }
      }
    });
  });

  // ------------------------------------------------- atomic member cap

  describe('member cap is atomic', () => {
    it('guest join locks the group row, then counts, then creates, all in one $transaction', async () => {
      const order: string[] = [];
      prisma.expenseGroup.update.mockImplementation(async () => void order.push('lock'));
      prisma.expenseGroupMember.count.mockImplementation(async () => {
        order.push('count');
        return 3;
      });
      prisma.expenseGroupMember.create.mockImplementation(async ({ data }: any) => {
        order.push('create');
        return { id: 'm-new', ...data };
      });
      await controller.join(TOKEN, { name: 'Dana' }, mkReq({ headers: {} }) as any, mkRes());
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(order).toEqual(['lock', 'count', 'create']);
    });

    it('refuses the 51st guest and creates nothing', async () => {
      prisma.expenseGroupMember.count.mockResolvedValue(50);
      const res = mkRes();
      await controller.join(TOKEN, { name: 'Dana' }, mkReq({ headers: {} }) as any, res);
      expect(res.location).toContain('f=limit');
      expect(prisma.expenseGroupMember.create).not.toHaveBeenCalled();
      expect(res.cookies).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------- write ceiling

  describe('write ceilings', () => {
    const body = () => ({
      csrf: csrf(),
      rid: RID,
      description: 'x',
      amount: '10',
      paidBy: A,
      splitType: 'equal',
      [`inc_${A}`]: '1',
    });
    const hitsByKey = (map: Record<string, number>) =>
      cache.incrementWindow.mockImplementation(async (key: string) => map[key] ?? 1);

    it('fails CLOSED when Redis is down', async () => {
      cache.incrementWindow.mockRejectedValue(new Error('redis down'));
      const spy = jest.spyOn(groups, 'createExpense');
      const res = mkRes();
      await controller.addExpense(TOKEN, body(), mkReq() as any, res);
      expect(cache.incrementWindow).toHaveBeenCalledWith(`grp:w:${G}:${A}`, 3_600_000);
      expect(res.statusCode).toBe(503);
      expect(spy).not.toHaveBeenCalled();
    });

    it('refuses the group above 200 writes per hour', async () => {
      hitsByKey({ [`grp:w:${G}`]: 201 });
      const spy = jest.spyOn(groups, 'createExpense');
      const res = mkRes();
      await controller.addExpense(TOKEN, body(), mkReq() as any, res);
      expect(res.statusCode).toBe(429);
      expect(spy).not.toHaveBeenCalled();
    });

    it('allows exactly 200 for the group and exactly 60 for the member', async () => {
      hitsByKey({ [`grp:w:${G}`]: 200, [`grp:w:${G}:${A}`]: 60 });
      jest.spyOn(groups, 'createExpense').mockResolvedValue({} as any);
      const res = mkRes();
      await controller.addExpense(TOKEN, body(), mkReq() as any, res);
      expect(res.statusCode).toBe(303);
    });

    it('a member over their own 60/h is refused WITHOUT charging the group bucket', async () => {
      hitsByKey({ [`grp:w:${G}:${A}`]: 61 });
      const spy = jest.spyOn(groups, 'createExpense');
      const res = mkRes();
      await controller.addExpense(TOKEN, body(), mkReq() as any, res);
      expect(res.statusCode).toBe(429);
      expect(spy).not.toHaveBeenCalled();
      expect(cache.incrementWindow).not.toHaveBeenCalledWith(`grp:w:${G}`, expect.anything());
    });

    it('is charged only AFTER the actor + CSRF checks pass', async () => {
      const noCookie = mkRes();
      await controller.addExpense(TOKEN, body(), mkReq({ headers: {} }) as any, noCookie);
      const badCsrf = mkRes();
      await controller.addExpense(TOKEN, { ...body(), csrf: 'bad' }, mkReq() as any, badCsrf);
      const link = mkRes();
      await controller.link(TOKEN, { csrf: 'bad' }, mkReq() as any, link);
      expect(cache.incrementWindow).not.toHaveBeenCalled();
    });

    it('a guest join never touches the write ceiling: it has its own per-group grp:j bucket (30/h)', async () => {
      const res = mkRes();
      await controller.join(TOKEN, { memberId: B }, mkReq({ headers: {} }) as any, res);
      expect(cache.incrementWindow).toHaveBeenCalledTimes(1);
      expect(cache.incrementWindow).toHaveBeenCalledWith(`grp:j:${G}`, 3_600_000);

      hitsByKey({ [`grp:j:${G}`]: 31 });
      const busy = mkRes();
      await controller.join(TOKEN, { memberId: B }, mkReq({ headers: {} }) as any, busy);
      expect(busy.statusCode).toBe(429);

      hitsByKey({ [`grp:j:${G}`]: 30 });
      const ok = mkRes();
      await controller.join(TOKEN, { memberId: B }, mkReq({ headers: {} }) as any, ok);
      expect(ok.statusCode).toBe(303);
    });

    it('join fails closed when Redis is down', async () => {
      cache.incrementWindow.mockRejectedValue(new Error('redis down'));
      const res = mkRes();
      await controller.join(TOKEN, { memberId: B }, mkReq({ headers: {} }) as any, res);
      expect(res.statusCode).toBe(503);
      expect(prisma.expenseGroupMember.updateMany).not.toHaveBeenCalled();
    });

    it('an unauthenticated flood of joins cannot spend the members write budget', async () => {
      for (let i = 0; i < 40; i++) {
        await controller.join(TOKEN, { memberId: B }, mkReq({ headers: {} }) as any, mkRes());
      }
      expect(cache.incrementWindow.mock.calls.every(([k]: [string]) => k === `grp:j:${G}`)).toBe(true);
    });
  });

  // -------------------------------------------------------------- link code

  describe('POST /g/:token/link', () => {
    const androidReq = () =>
      mkReq({ headers: { cookie: `abg_m=${SECRET}`, 'user-agent': 'Mozilla/5.0 (Linux; Android 14)' } }) as any;

    it('mints a single-use code bound to the cookie member and 303s to the constant web base', async () => {
      const res = mkRes();
      await controller.link(TOKEN, { csrf: csrf(), target: 'web' }, mkReq() as any, res);
      const [key, value, ttl] = cache.set.mock.calls[0];
      expect(key).toMatch(/^grp:link:[a-f0-9]{32}$/);
      expect(value).toEqual({ groupId: G, memberId: A, guestToken: TOKEN });
      expect(ttl).toBe(600);
      const code = key.split(':')[2];
      expect(res.statusCode).toBe(303);
      expect(res.location).toBe(`https://app.ai-budget.pl/groups/link?code=${code}&src=group&loc=guest_link`);
    });

    it('uses the budget:// deep link only for target=app on Android', async () => {
      const res = mkRes();
      await controller.link(TOKEN, { csrf: csrf(), target: 'app' }, androidReq(), res);
      expect(res.location).toMatch(/^budget:\/\/groups\/link\?code=[a-f0-9]{32}$/);

      const desktop = mkRes();
      await controller.link(TOKEN, { csrf: csrf(), target: 'app' }, mkReq() as any, desktop);
      expect(desktop.location).toMatch(/^https:\/\/app\.ai-budget\.pl\/groups\/link\?code=/);
    });

    it('never lets the request choose the destination', async () => {
      const res = mkRes();
      await controller.link(
        TOKEN,
        { csrf: csrf(), target: 'https://evil.example', redirect: 'https://evil.example', next: '//evil.example' },
        mkReq() as any,
        res,
      );
      expect(res.location).not.toContain('evil');
    });

    it('needs a cookie member and a valid CSRF value', async () => {
      const noCookie = mkRes();
      await controller.link(TOKEN, { csrf: csrf() }, mkReq({ headers: {} }) as any, noCookie);
      const badCsrf = mkRes();
      await controller.link(TOKEN, { csrf: 'bad' }, mkReq() as any, badCsrf);
      expect(cache.set).not.toHaveBeenCalled();
      expect(noCookie.location).toMatch(/^\/g\//);
      expect(badCsrf.location).toMatch(/^\/g\//);
    });

    it('does not hand out a code that never landed in Redis', async () => {
      cache.get.mockResolvedValue(null);
      const res = mkRes();
      await controller.link(TOKEN, { csrf: csrf() }, mkReq() as any, res);
      expect(res.location).toContain('f=linkfailed');
    });
  });
});

describe('GroupsService.linkGuest', () => {
  let prisma: any;
  let cache: any;
  let service: GroupsService;
  const payload = { groupId: G, memberId: B, guestToken: TOKEN };

  beforeEach(() => {
    prisma = {
      expenseGroup: {
        findUnique: jest.fn(async () => ({
          id: G,
          name: 'Flat',
          emoji: null,
          currencyCode: 'PLN',
          ownerUserId: 'u-owner',
          guestToken: TOKEN,
          guestAccess: true,
          status: 'active',
          ledgerVersion: 1,
        })),
      },
      expenseGroupMember: {
        findFirst: jest.fn(async ({ where }: any) => {
          if (where.userId === 'u-me') return null; // not yet a member
          if (where.id === B) return { id: B, userId: null, claimedAt: new Date() };
          return null;
        }),
        findMany: jest.fn(async () => [mkMember(B, { userId: 'u-me' })]),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      groupExpense: { findMany: jest.fn(async () => []) },
      groupSettlement: { findMany: jest.fn(async () => []) },
    };
    cache = { getAndDelete: jest.fn(async () => payload) };
    service = new GroupsService(prisma, cache, { sendToUser: jest.fn() } as any);
  });

  it('redeems with an atomic GETDEL and binds the caller with a userId:null guard', async () => {
    const out = await service.linkGuest('u-me', 'f'.repeat(32));
    expect(cache.getAndDelete).toHaveBeenCalledWith(`grp:link:${'f'.repeat(32)}`);
    expect(prisma.expenseGroupMember.updateMany).toHaveBeenCalledWith({
      where: { id: B, groupId: G, userId: null },
      data: expect.objectContaining({ userId: 'u-me' }),
    });
    expect(out.id).toBe(G);
  });

  it('is single-use: the second redemption gets 410 LINK_CODE_INVALID', async () => {
    cache.getAndDelete.mockResolvedValueOnce(payload).mockResolvedValueOnce(null);
    await service.linkGuest('u-me', 'f'.repeat(32));
    await expect(service.linkGuest('u-me', 'f'.repeat(32))).rejects.toMatchObject({
      status: 410,
      response: { code: 'LINK_CODE_INVALID' },
    });
  });

  it('410 for a missing or expired code (also a Redis outage)', async () => {
    cache.getAndDelete.mockResolvedValue(null);
    await expect(service.linkGuest('u-me', 'f'.repeat(32))).rejects.toBeInstanceOf(GoneException);
    expect(prisma.expenseGroupMember.updateMany).not.toHaveBeenCalled();
  });

  it('410 when the member already has a userId', async () => {
    prisma.expenseGroupMember.findFirst.mockImplementation(async ({ where }: any) =>
      where.id === B ? { id: B, userId: 'u-other', claimedAt: null } : null,
    );
    await expect(service.linkGuest('u-me', 'f'.repeat(32))).rejects.toBeInstanceOf(GoneException);
    expect(prisma.expenseGroupMember.updateMany).not.toHaveBeenCalled();
  });

  it('410 when the guard-less updateMany matches nothing (lost the race)', async () => {
    prisma.expenseGroupMember.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.linkGuest('u-me', 'f'.repeat(32))).rejects.toBeInstanceOf(GoneException);
  });

  it('409 ALREADY_MEMBER when the caller is already in the group', async () => {
    prisma.expenseGroupMember.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.userId === 'u-me') return { id: 'm-mine', displayName: 'Me' };
      if (where.id === B) return { id: B, userId: null, claimedAt: null };
      return null;
    });
    await expect(service.linkGuest('u-me', 'f'.repeat(32))).rejects.toMatchObject({
      status: 409,
      response: { code: 'ALREADY_MEMBER' },
    });
    expect(prisma.expenseGroupMember.updateMany).not.toHaveBeenCalled();
  });

  it('maps a unique violation on (groupId, userId) to ALREADY_MEMBER', async () => {
    prisma.expenseGroupMember.updateMany.mockRejectedValue({ code: 'P2002' });
    await expect(service.linkGuest('u-me', 'f'.repeat(32))).rejects.toBeInstanceOf(ConflictException);
  });

  describe('a code does not outlive the link it was minted from (410 LINK_CODE_INVALID)', () => {
    const setGroup = (over: any) =>
      prisma.expenseGroup.findUnique.mockImplementation(async () => ({
        id: G,
        name: 'Flat',
        emoji: null,
        currencyCode: 'PLN',
        ownerUserId: 'u-owner',
        guestToken: TOKEN,
        guestAccess: true,
        status: 'active',
        ledgerVersion: 1,
        ...over,
      }));
    const expectGone = async () => {
      await expect(service.linkGuest('u-me', 'f'.repeat(32))).rejects.toMatchObject({
        status: 410,
        response: { code: 'LINK_CODE_INVALID' },
      });
      expect(prisma.expenseGroupMember.updateMany).not.toHaveBeenCalled();
    };
    it('after the link was rotated', async () => {
      setGroup({ guestToken: 'rotated'.repeat(5) });
      await expectGone();
    });
    it('after guestAccess was switched off', async () => {
      setGroup({ guestAccess: false });
      await expectGone();
    });
    it('after the group was archived', async () => {
      setGroup({ status: 'archived' });
      await expectGone();
    });
    it('when the group is gone', async () => {
      prisma.expenseGroup.findUnique.mockResolvedValue(null);
      await expectGone();
    });
    it('for a legacy payload with no guestToken', async () => {
      cache.getAndDelete.mockResolvedValue({ groupId: G, memberId: B });
      await expectGone();
    });
  });

  it('clears claimTokenHash and claimedAt so the old browser cookie stops acting as the linked member', async () => {
    await service.linkGuest('u-me', 'f'.repeat(32));
    expect(prisma.expenseGroupMember.updateMany).toHaveBeenCalledWith({
      where: { id: B, groupId: G, userId: null },
      data: { userId: 'u-me', claimedAt: null, claimTokenHash: null, joinedVia: 'guest_linked', linkedAt: expect.any(Date) },
    });
  });
});
