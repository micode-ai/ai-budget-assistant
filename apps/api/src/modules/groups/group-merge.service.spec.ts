import { GroupMergeService } from './group-merge.service';
import { GroupsService } from './groups.service';
import { GroupItemsService } from './group-items.service';
import { GroupGuestService, sha256Hex } from './group-guest.service';
import { computeGroupLedger, resolveGroupShares } from './group-ledger';
import { computeItemizedShares, type ClaimRow } from './group-items';

/**
 * ABA-657: the merge transaction, run over a small in-memory Prisma whose `$transaction` rolls every
 * table back when the callback throws, so "aborted" is observed on the data, not on mock calls. The
 * balance check below is computed independently of the service, from the tables themselves.
 */

type Row = Record<string, any>;
type Tables = Record<'members' | 'expenses' | 'shares' | 'settlements' | 'items' | 'claims' | 'events', Row[]> & { group: Row };

const G = 'g-1';
const OTHER_G = 'g-2';
const TOKEN = 'a'.repeat(32);
const OWNER = 'm-owner';
const APP = 'm-app'; // another app user
const ANN = 'm-ann'; // a claimed guest
const BO = 'm-bo'; // an unclaimed guest (ABA-657 review M2: the only kind an owner may merge another guest into)
const CL = 'm-claimed'; // a guest claimed by someone else's browser
const PH = 'm-ph'; // an unclaimed placeholder
const GONE = 'm-gone'; // removed
const FOREIGN = 'm-foreign'; // another group's member
const ANN_SECRET = 'b'.repeat(32);

function cmp(rowVal: unknown, cond: unknown): boolean {
  if (cond === undefined) return true;
  if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
    const c = cond as Row;
    if ('in' in c) return (c.in as unknown[]).includes(rowVal);
    if ('not' in c) return c.not === null ? rowVal !== null && rowVal !== undefined : rowVal !== c.not;
    if ('gt' in c) return rowVal instanceof Date && rowVal.getTime() > new Date(c.gt).getTime();
    if ('lt' in c) return rowVal instanceof Date && rowVal.getTime() < new Date(c.lt).getTime();
    return true;
  }
  return (rowVal ?? null) === cond;
}

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Row[]).some((w) => matches(row, w));
    return cmp(row[k], v);
  });
}

function applyData(row: Row, data: Row) {
  for (const [k, v] of Object.entries(data)) {
    if (v !== null && typeof v === 'object' && 'increment' in (v as Row)) row[k] = (row[k] ?? 0) + (v as Row).increment;
    else row[k] = v;
  }
}

function makeDb(t: Tables) {
  const clone = (): Tables => JSON.parse(JSON.stringify(t), (k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v));
  const withShares = (e: Row) => ({ ...e, shares: t.shares.filter((s) => s.groupExpenseId === e.id).map((s) => ({ ...s })) });
  const table = (name: keyof Omit<Tables, 'group'>, opts: { expand?: (r: Row) => Row; unique?: string[] } = {}) => {
    const expand = opts.expand ?? ((r: Row) => ({ ...r }));
    const check = () => {
      if (!opts.unique) return;
      const keys = t[name].map((r) => opts.unique!.map((k) => r[k]).join('|'));
      if (new Set(keys).size !== keys.length) throw Object.assign(new Error(`unique ${name}`), { code: 'P2002' });
    };
    return {
      findMany: jest.fn(async ({ where }: Row = {}) => t[name].filter((r) => matches(r, where)).map(expand)),
      findFirst: jest.fn(async ({ where }: Row = {}) => {
        const r = t[name].find((x) => matches(x, where));
        return r ? expand(r) : null;
      }),
      update: jest.fn(async ({ where, data }: Row) => {
        const r = t[name].find((x) => matches(x, where));
        if (!r) throw new Error(`update: no ${name} row`);
        applyData(r, data);
        check();
        return expand(r);
      }),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        const hit = t[name].filter((x) => matches(x, where));
        hit.forEach((r) => applyData(r, data));
        check();
        return { count: hit.length };
      }),
      deleteMany: jest.fn(async ({ where }: Row) => {
        const before = t[name].length;
        t[name] = t[name].filter((x) => !matches(x, where));
        return { count: before - t[name].length };
      }),
      create: jest.fn(async ({ data }: Row) => {
        const r = { id: `${name}-${t[name].length + 1}`, createdAt: new Date(), ...data };
        t[name].push(r);
        return r;
      }),
      count: jest.fn(async ({ where }: Row = {}) => t[name].filter((r) => matches(r, where)).length),
    };
  };

  const prisma: any = {
    expenseGroup: {
      findUnique: jest.fn(async ({ where }: Row) =>
        (where.id ? where.id === t.group.id : where.guestToken === t.group.guestToken) ? { ...t.group } : null,
      ),
      update: jest.fn(async ({ where, data }: Row) => {
        if (where.id !== t.group.id) throw new Error('no group');
        applyData(t.group, data);
        return { ...t.group };
      }),
      updateMany: jest.fn(async () => ({ count: 0 })),
      count: jest.fn(async () => 0),
    },
    expenseGroupMember: table('members'),
    groupExpense: table('expenses', { expand: withShares }),
    groupExpenseShare: table('shares', { unique: ['groupExpenseId', 'memberId'] }),
    groupSettlement: table('settlements'),
    groupExpenseItem: table('items'),
    groupItemClaim: table('claims', { unique: ['itemId', 'memberId'] }),
    groupMemberEvent: table('events'),
  };
  prisma.$transaction = jest.fn(async (fn: any) => {
    const snap = clone();
    try {
      return await fn(prisma);
    } catch (e) {
      Object.assign(t, snap);
      throw e;
    }
  });
  return prisma;
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
    mergedIntoMemberId: null,
    createdAt: new Date('2026-01-01'),
    ...over,
  };
}

/** Net per member straight from the tables (live members padded, removed strays kept). */
function balances(t: Tables): Map<string, number> {
  const ledger = computeGroupLedger(
    t.members.filter((m) => m.groupId === G && !m.removedAt).map((m) => ({ id: m.id })),
    t.expenses
      .filter((e) => e.groupId === G && !e.deletedAt)
      .map((e) => ({
        id: e.id,
        paidByMemberId: e.paidByMemberId,
        amount: Number(e.amount),
        shares: t.shares.filter((s) => s.groupExpenseId === e.id).map((s) => ({ memberId: s.memberId, shareAmount: Number(s.shareAmount) })),
      })),
    t.settlements.filter((s) => s.groupId === G && !s.voidedAt).map((s) => ({ id: s.id, fromMemberId: s.fromMemberId, toMemberId: s.toMemberId, amount: Number(s.amount) })),
  );
  return new Map(ledger.balances.map((b) => [b.memberId, b.netAmount]));
}

function expectPreserved(before: Map<string, number>, after: Map<string, number>, from: string, into: string) {
  const g = (m: Map<string, number>, id: string) => m.get(id) ?? 0;
  expect(g(after, into)).toBeCloseTo(g(before, from) + g(before, into), 2);
  expect(g(after, from)).toBeCloseTo(0, 2);
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (id === from || id === into) continue;
    expect(g(after, id)).toBeCloseTo(g(before, id), 2);
  }
}

let seq = 0;
function addExpense(t: Tables, e: { paidBy: string; amount: number; split: 'equal' | 'exact' | 'percentage' | 'shares'; raw: { memberId: string; value?: number }[]; fx?: { original: number; currency: string; rate: number }; createdBy?: string; deleted?: boolean }) {
  const id = `e-${++seq}`;
  t.expenses.push({
    id,
    groupId: G,
    description: id,
    amount: e.amount,
    date: new Date('2026-09-01'),
    paidByMemberId: e.paidBy,
    splitType: e.split,
    createdByMemberId: e.createdBy ?? e.paidBy,
    originalAmount: e.fx?.original ?? null,
    originalCurrency: e.fx?.currency ?? null,
    fxRate: e.fx?.rate ?? null,
    itemized: false,
    deletedAt: e.deleted ? new Date() : null,
    deletedByMemberId: e.deleted ? e.paidBy : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  for (const s of resolveGroupShares(e.amount, e.split, e.raw)) {
    t.shares.push({ id: `s-${++seq}`, groupExpenseId: id, memberId: s.memberId, shareValue: s.shareValue, shareAmount: s.shareAmount });
  }
  return id;
}

function addItemized(t: Tables, e: { paidBy: string; amount: number; items: { totalPrice: number }[]; claims: { item: number; memberId: string; bp?: number }[]; fx?: { original: number; rate: number } }) {
  const id = `e-${++seq}`;
  const items = e.items.map((i, k) => ({ id: `i-${++seq}`, groupExpenseId: id, name: `line ${k}`, totalPrice: i.totalPrice, lineDiscount: null, position: k }));
  const claims: ClaimRow[] = e.claims.map((c) => ({ itemId: items[c.item].id, memberId: c.memberId, shareBp: c.bp ?? null }));
  t.items.push(...items);
  for (const c of claims) t.claims.push({ id: `c-${++seq}`, ...c });
  t.expenses.push({
    id,
    groupId: G,
    description: id,
    amount: e.amount,
    date: new Date('2026-09-01'),
    paidByMemberId: e.paidBy,
    splitType: 'exact',
    createdByMemberId: e.paidBy,
    originalAmount: e.fx?.original ?? null,
    originalCurrency: e.fx ? 'EUR' : null,
    fxRate: e.fx?.rate ?? null,
    itemized: true,
    discountAmount: null,
    claimsOpenUntil: new Date(Date.now() + 86400000),
    deletedAt: null,
    deletedByMemberId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const shares = computeItemizedShares(
    { amount: e.amount, originalAmount: e.fx?.original ?? null, discountAmount: null, paidByMemberId: e.paidBy },
    items.map((i) => ({ id: i.id, totalPrice: i.totalPrice })),
    claims,
  );
  for (const s of shares) t.shares.push({ id: `s-${++seq}`, groupExpenseId: id, memberId: s.memberId, shareValue: s.shareValue, shareAmount: s.shareAmount });
  return { id, items };
}

function addSettlement(t: Tables, from: string, to: string, amount: number, voided = false) {
  const id = `st-${++seq}`;
  t.settlements.push({
    id,
    groupId: G,
    fromMemberId: from,
    toMemberId: to,
    amount,
    method: null,
    recordedByMemberId: from,
    voidedAt: voided ? new Date() : null,
    voidedByMemberId: voided ? to : null,
    createdAt: new Date(),
  });
  return id;
}

describe('GroupMergeService (ABA-657)', () => {
  let t: Tables;
  let prisma: any;
  let merger: GroupMergeService;

  beforeEach(() => {
    seq = 0;
    t = {
      group: { id: G, name: 'Flat', emoji: null, currencyCode: 'PLN', ownerUserId: 'u-owner', guestToken: TOKEN, guestAccess: true, status: 'active', ledgerVersion: 7 },
      members: [
        mkMember(OWNER, { userId: 'u-owner' }),
        mkMember(APP, { userId: 'u-app' }),
        mkMember(ANN, { claimTokenHash: sha256Hex(ANN_SECRET), claimedAt: new Date('2026-02-01') }),
        mkMember(BO),
        mkMember(CL, { claimTokenHash: sha256Hex('c'.repeat(32)) }),
        mkMember(PH),
        mkMember(GONE, { removedAt: new Date('2026-03-01') }),
        mkMember(FOREIGN, { groupId: OTHER_G }),
      ],
      expenses: [],
      shares: [],
      settlements: [],
      items: [],
      claims: [],
      events: [],
    };
    prisma = makeDb(t);
    merger = new GroupMergeService(prisma);
  });

  const row = (id: string) => t.members.find((m) => m.id === id)!;

  describe('balance preservation', () => {
    it('re-points payer, creator, shares and settlements; the pair sum and everyone else are unchanged', async () => {
      addExpense(t, { paidBy: ANN, amount: 90, split: 'equal', raw: [{ memberId: ANN }, { memberId: BO }, { memberId: OWNER }] });
      addExpense(t, { paidBy: OWNER, amount: 40, split: 'exact', raw: [{ memberId: ANN, value: 25 }, { memberId: PH, value: 15 }] });
      addExpense(t, { paidBy: BO, amount: 33.33, split: 'percentage', raw: [{ memberId: ANN, value: 50 }, { memberId: BO, value: 50 }], createdBy: ANN });
      addSettlement(t, BO, ANN, 10);
      const before = balances(t);

      await merger.merge(G, OWNER, ANN, BO);

      expectPreserved(before, balances(t), ANN, BO);
      expect(t.expenses.some((e) => e.paidByMemberId === ANN || e.createdByMemberId === ANN)).toBe(false);
      expect(t.shares.some((s) => s.memberId === ANN)).toBe(false);
      expect(t.settlements.some((s) => s.fromMemberId === ANN || s.toMemberId === ANN)).toBe(false);
      expect(t.group.ledgerVersion).toBe(8);
    });

    it('combines overlapping shares per split type, and an equal split becomes units so a later edit keeps the double part', async () => {
      const eq = addExpense(t, { paidBy: OWNER, amount: 10, split: 'equal', raw: [{ memberId: ANN }, { memberId: BO }, { memberId: OWNER }] });
      const ex = addExpense(t, { paidBy: OWNER, amount: 20, split: 'exact', raw: [{ memberId: ANN, value: 7.5 }, { memberId: BO, value: 12.5 }] });
      const pc = addExpense(t, { paidBy: OWNER, amount: 50, split: 'percentage', raw: [{ memberId: ANN, value: 30 }, { memberId: BO, value: 30 }, { memberId: OWNER, value: 40 }] });
      const un = addExpense(t, { paidBy: OWNER, amount: 12, split: 'shares', raw: [{ memberId: ANN, value: 1 }, { memberId: BO, value: 2 }, { memberId: OWNER, value: 3 }] });
      const before = balances(t);

      await merger.merge(G, OWNER, ANN, BO);

      expectPreserved(before, balances(t), ANN, BO);
      const share = (e: string, m: string) => t.shares.find((s) => s.groupExpenseId === e && s.memberId === m);
      expect(t.shares.filter((s) => s.groupExpenseId === eq)).toHaveLength(2);
      expect(t.expenses.find((e) => e.id === eq)!.splitType).toBe('shares');
      expect(share(eq, BO)).toEqual(expect.objectContaining({ shareValue: 2, shareAmount: 6.66 }));
      expect(share(eq, OWNER)!.shareValue).toBe(1);
      // Re-resolving the stored units (what an edit does) keeps BO's double part.
      const re = resolveGroupShares(10, 'shares', t.shares.filter((s) => s.groupExpenseId === eq).map((s) => ({ memberId: s.memberId, value: s.shareValue })));
      expect(re.find((r) => r.memberId === BO)!.shareAmount).toBeGreaterThanOrEqual(6.66);
      expect(share(ex, BO)).toEqual(expect.objectContaining({ shareValue: 20, shareAmount: 20 }));
      expect(share(pc, BO)!.shareValue).toBe(60);
      expect(share(un, BO)!.shareValue).toBe(3);
    });

    it('keeps multi-currency rows exact: converted amounts, original-currency share values summed', async () => {
      // 30 EUR at 4.3123 = 129.37 PLN, exact 10 + 20 EUR applied as weights.
      const fx = addExpense(t, {
        paidBy: ANN,
        amount: 129.37,
        split: 'shares',
        raw: [{ memberId: ANN, value: 10 }, { memberId: BO, value: 20 }],
        fx: { original: 30, currency: 'EUR', rate: 4.3123 },
      });
      t.shares.filter((s) => s.groupExpenseId === fx).forEach((s) => (s.shareValue = s.memberId === ANN ? 10 : 20));
      t.expenses.find((e) => e.id === fx)!.splitType = 'exact';
      addExpense(t, { paidBy: BO, amount: 77.77, split: 'equal', raw: [{ memberId: ANN }, { memberId: OWNER }], fx: { original: 18, currency: 'USD', rate: 4.3206 } });
      const before = balances(t);

      await merger.merge(G, OWNER, ANN, BO);

      expectPreserved(before, balances(t), ANN, BO);
      const fxRow = t.expenses.find((e) => e.id === fx)!;
      expect(fxRow).toEqual(expect.objectContaining({ amount: 129.37, originalAmount: 30, originalCurrency: 'EUR', fxRate: 4.3123, paidByMemberId: BO }));
      expect(t.shares.filter((s) => s.groupExpenseId === fx)).toEqual([expect.objectContaining({ memberId: BO, shareValue: 30, shareAmount: 129.37 })]);
    });

    it('itemised: combines and converts claims, sums the share rows, and stays exact when the absorbed member paid', async () => {
      const a = addItemized(t, {
        paidBy: ANN,
        amount: 60,
        items: [{ totalPrice: 30 }, { totalPrice: 12 }, { totalPrice: 9 }],
        claims: [
          { item: 0, memberId: ANN },
          { item: 0, memberId: BO },
          { item: 0, memberId: OWNER },
          { item: 1, memberId: ANN },
          { item: 1, memberId: BO },
          { item: 2, memberId: ANN, bp: 3000 },
          { item: 2, memberId: BO, bp: 2000 },
          { item: 2, memberId: OWNER, bp: 5000 },
        ],
      });
      const b = addItemized(t, {
        paidBy: OWNER,
        amount: 51.75,
        items: [{ totalPrice: 10 }],
        claims: [{ item: 0, memberId: ANN }, { item: 0, memberId: APP }],
        fx: { original: 12, rate: 4.3125 },
      });
      const before = balances(t);

      await merger.merge(G, OWNER, ANN, BO);

      expectPreserved(before, balances(t), ANN, BO);
      const claimOf = (itemId: string, m: string) => t.claims.find((c) => c.itemId === itemId && c.memberId === m);
      expect(t.claims.some((c) => c.memberId === ANN)).toBe(false);
      // Line 0: equal three ways -> explicit 2/3 and 1/3.
      expect(claimOf(a.items[0].id, BO)!.shareBp).toBe(6667);
      expect(claimOf(a.items[0].id, OWNER)!.shareBp).toBe(3333);
      // Line 1: only the pair -> into keeps the whole line, still "equal".
      expect(claimOf(a.items[1].id, BO)!.shareBp).toBeNull();
      // Line 2: hand-split, bp summed.
      expect(claimOf(a.items[2].id, BO)!.shareBp).toBe(5000);
      expect(claimOf(a.items[2].id, OWNER)!.shareBp).toBe(5000);
      // A line only the absorbed member shared with someone else: re-pointed as is.
      expect(claimOf(b.items[0].id, BO)!.shareBp).toBeNull();
      expect(claimOf(b.items[0].id, APP)).toBeDefined();
      expect(t.expenses.find((e) => e.id === a.id)!.paidByMemberId).toBe(BO);
    });

    it('a property: random ledgers keep the pair sum and every other balance (and no unique key breaks)', async () => {
      let state = 42;
      const rnd = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
      const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
      const people = [OWNER, APP, ANN, BO, PH];
      for (let run = 0; run < 60; run++) {
        seq = 0;
        t.members = [
          mkMember(OWNER, { userId: 'u-owner' }),
          mkMember(APP, { userId: 'u-app' }),
          mkMember(ANN),
          mkMember(BO),
          mkMember(PH),
        ];
        t.expenses = [];
        t.shares = [];
        t.settlements = [];
        t.items = [];
        t.claims = [];
        t.events = [];
        for (let k = 0; k < 8; k++) {
          const who = [...new Set(Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => pick(people)))];
          const amount = Math.round((5 + rnd() * 200) * 100) / 100;
          const kind = pick(['equal', 'exact', 'percentage', 'shares', 'itemised'] as const);
          if (kind === 'itemised') {
            const lines = 1 + Math.floor(rnd() * 3);
            const items = Array.from({ length: lines }, () => ({ totalPrice: Math.round((amount / (lines + 1)) * 100) / 100 }));
            const claims = items.flatMap((_, i) => who.filter(() => rnd() < 0.7).map((memberId) => ({ item: i, memberId })));
            addItemized(t, { paidBy: pick(people), amount, items, claims, ...(rnd() < 0.3 ? { fx: { original: Math.round((amount / 4.31) * 100) / 100, rate: 4.31 } } : {}) });
            continue;
          }
          const raw =
            kind === 'equal'
              ? who.map((memberId) => ({ memberId }))
              : kind === 'exact'
                ? who.map((memberId, i) => ({
                    memberId,
                    value: i === who.length - 1 ? Math.round((amount - (Math.floor(amount / who.length * 100) / 100) * (who.length - 1)) * 100) / 100 : Math.floor((amount / who.length) * 100) / 100,
                  }))
                : kind === 'percentage'
                  ? who.map((memberId, i) => ({ memberId, value: i === who.length - 1 ? 100 - Math.floor(100 / who.length) * (who.length - 1) : Math.floor(100 / who.length) }))
                  : who.map((memberId) => ({ memberId, value: 1 + Math.floor(rnd() * 3) }));
          addExpense(t, { paidBy: pick(people), amount, split: kind, raw, deleted: rnd() < 0.1 });
        }
        for (let k = 0; k < 3; k++) {
          const a = pick(people);
          const b = pick(people.filter((p) => p !== a));
          addSettlement(t, a, b, Math.round(rnd() * 3000) / 100 + 0.01, rnd() < 0.2);
        }
        const from = pick([ANN, BO, PH]);
        const into = pick([OWNER, ...[ANN, BO, PH].filter((p) => p !== from)]);
        const before = balances(t);
        await merger.merge(G, OWNER, from, into);
        expectPreserved(before, balances(t), from, into);
        const shareKeys = t.shares.map((s) => `${s.groupExpenseId}|${s.memberId}`);
        expect(new Set(shareKeys).size).toBe(shareKeys.length);
        expect(t.shares.concat(t.claims).some((r) => r.memberId === from)).toBe(false);
      }
    });
  });

  describe('a settlement between the two', () => {
    it('becomes self-referential and is voided by the actor; the pair sum is unchanged', async () => {
      addExpense(t, { paidBy: BO, amount: 20, split: 'equal', raw: [{ memberId: ANN }, { memberId: BO }] });
      const s1 = addSettlement(t, ANN, BO, 10);
      const s2 = addSettlement(t, BO, ANN, 3);
      const old = addSettlement(t, ANN, BO, 5, true);
      const other = addSettlement(t, OWNER, ANN, 4);
      const before = balances(t);

      await merger.merge(G, OWNER, ANN, BO);

      expectPreserved(before, balances(t), ANN, BO);
      const s = (id: string) => t.settlements.find((x) => x.id === id)!;
      expect(s(s1)).toEqual(expect.objectContaining({ fromMemberId: BO, toMemberId: BO, voidedByMemberId: OWNER }));
      expect(s(s1).voidedAt).toBeInstanceOf(Date);
      expect(s(s2).voidedAt).toBeInstanceOf(Date);
      // An already-voided one keeps its voider (re-pointed only if it was the absorbed member).
      expect(s(old)).toEqual(expect.objectContaining({ voidedByMemberId: BO, fromMemberId: BO }));
      expect(s(other)).toEqual(expect.objectContaining({ fromMemberId: OWNER, toMemberId: BO, voidedAt: null }));
    });
  });

  describe('the absorbed row and the event', () => {
    it('soft-removes the absorbed row with mergedIntoMemberId, clears its claim, and logs member_merged', async () => {
      await merger.merge(G, OWNER, ANN, BO);
      expect(row(ANN)).toEqual(
        expect.objectContaining({ removedAt: expect.any(Date), claimTokenHash: null, claimedAt: null, mergedIntoMemberId: BO, displayName: 'ann' }),
      );
      expect(t.events).toEqual([
        expect.objectContaining({ groupId: G, kind: 'member_merged', actorMemberId: OWNER, subjectMemberId: ANN, targetMemberId: BO, subjectName: 'ann' }),
      ]);
    });

    it('never re-points older event rows (no FK, history keeps its names)', async () => {
      t.events.push({ id: 'ev-1', groupId: G, kind: 'claim_reset', actorMemberId: OWNER, subjectMemberId: ANN, targetMemberId: null, subjectName: 'ann', createdAt: new Date() });
      await merger.merge(G, OWNER, ANN, BO);
      expect(t.events.find((e) => e.id === 'ev-1')!.subjectMemberId).toBe(ANN);
    });
  });

  describe('consent and IDOR', () => {
    it('the owner merges two guests, and a guest into their own row', async () => {
      await expect(merger.merge(G, OWNER, ANN, BO)).resolves.toEqual({ fromMemberId: ANN, intoMemberId: BO });
      await expect(merger.merge(G, OWNER, PH, OWNER)).resolves.toEqual({ fromMemberId: PH, intoMemberId: OWNER });
    });

    it('the owner may NOT fold a guest into a guest row another person has claimed (403 MERGE_NOT_ALLOWED)', async () => {
      await expect(merger.merge(G, OWNER, ANN, CL)).rejects.toMatchObject({ status: 403, response: { code: 'MERGE_NOT_ALLOWED' } });
      expect(row(ANN).removedAt).toBeNull();
      expect(t.group.ledgerVersion).toBe(7);
    });

    it('swaps an app-user "from" so the app user survives', async () => {
      await expect(merger.merge(G, OWNER, OWNER, ANN)).resolves.toEqual({ fromMemberId: ANN, intoMemberId: OWNER });
      expect(row(OWNER).removedAt).toBeNull();
    });

    it('refuses two app users with 409 BOTH_APP_USERS', async () => {
      await expect(merger.merge(G, OWNER, APP, OWNER)).rejects.toMatchObject({ status: 409, response: { code: 'BOTH_APP_USERS' } });
      expect(t.group.ledgerVersion).toBe(7);
    });

    it('the owner may not push a guest onto another app user (403)', async () => {
      await expect(merger.merge(G, OWNER, ANN, APP)).rejects.toMatchObject({ status: 403, response: { code: 'MERGE_NOT_ALLOWED' } });
      expect(row(ANN).removedAt).toBeNull();
    });

    it('a non-owner absorbs an UNCLAIMED guest into their own row, and nothing else', async () => {
      await expect(merger.merge(G, APP, ANN, APP)).rejects.toMatchObject({ status: 403 }); // claimed
      await expect(merger.merge(G, APP, PH, BO)).rejects.toMatchObject({ status: 403 }); // not into me
      await expect(merger.merge(G, APP, PH, APP)).resolves.toEqual({ fromMemberId: PH, intoMemberId: APP });
    });

    it('nobody passes the owner rule on an orphaned group, but absorbing an unclaimed row still works', async () => {
      t.group.ownerUserId = null;
      await expect(merger.merge(G, OWNER, ANN, BO)).rejects.toMatchObject({ status: 403 });
      await expect(merger.merge(G, OWNER, PH, OWNER)).resolves.toBeDefined();
    });

    it('refuses a member of another group, a removed member and an unknown id with 404', async () => {
      for (const [a, b] of [[FOREIGN, BO], [ANN, FOREIGN], [GONE, BO], [ANN, GONE], ['nope', BO]]) {
        await expect(merger.merge(G, OWNER, a, b)).rejects.toMatchObject({ status: 404 });
      }
      expect(row(FOREIGN).removedAt).toBeNull();
      expect(t.events).toHaveLength(0);
    });

    it('refuses the same member twice (400) and an archived group (403)', async () => {
      await expect(merger.merge(G, OWNER, ANN, ANN)).rejects.toMatchObject({ status: 400, response: { code: 'MERGE_SAME_MEMBER' } });
      t.group.status = 'archived';
      await expect(merger.merge(G, OWNER, ANN, BO)).rejects.toMatchObject({ status: 403, response: { code: 'GROUP_ARCHIVED' } });
      expect(t.group.ledgerVersion).toBe(7);
    });

    it('a merged row cannot be merged again', async () => {
      await merger.merge(G, OWNER, ANN, BO);
      await expect(merger.merge(G, OWNER, ANN, PH)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('the in-transaction assertion', () => {
    it('rolls EVERYTHING back with 500 when a write breaks a balance (here: the payer re-point is lost)', async () => {
      addExpense(t, { paidBy: ANN, amount: 30, split: 'equal', raw: [{ memberId: ANN }, { memberId: OWNER }] });
      const snapshot = JSON.stringify({ ...t, group: { ...t.group } });
      const real = prisma.groupExpense.updateMany;
      prisma.groupExpense.updateMany = jest.fn(async (args: any) => (args.data.paidByMemberId ? { count: 0 } : real(args)));
      const err = jest.spyOn((merger as any).logger, 'error').mockImplementation(() => undefined);

      await expect(merger.merge(G, OWNER, ANN, BO)).rejects.toMatchObject({ status: 500, response: { code: 'MERGE_INVARIANT' } });

      expect(JSON.stringify({ ...t, group: { ...t.group } })).toBe(snapshot);
      expect(row(ANN).removedAt).toBeNull();
      expect(t.events).toHaveLength(0);
      expect(err).toHaveBeenCalled();
    });
  });

  describe('self-merge via a link code (POST /groups/link-guest {code, merge: true})', () => {
    let store: Map<string, unknown>;
    let cache: any;
    let groups: GroupsService;
    let guest: GroupGuestService;
    const guestGroup = () => ({ id: G, guestToken: t.group.guestToken, name: 'Flat', emoji: null, currencyCode: 'PLN', status: 'active', ledgerVersion: 4 }) as any;

    beforeEach(() => {
      store = new Map();
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
      groups = new GroupsService(prisma, cache, { sendToUser: jest.fn() } as any, { getRates: jest.fn() } as any, merger);
      guest = new GroupGuestService(prisma, cache, groups, new GroupItemsService(prisma, groups, cache));
    });

    const mint = async () => guest.mintLinkCode(guestGroup(), (await guest.identify(guestGroup(), ANN_SECRET))!);

    it('409 ALREADY_MEMBER offers the merge and keeps the code; the merge then folds the guest into my row', async () => {
      addExpense(t, { paidBy: ANN, amount: 40, split: 'equal', raw: [{ memberId: ANN }, { memberId: APP }, { memberId: OWNER }, { memberId: BO }] });
      const before = balances(t);
      const code = (await mint())!;

      await expect(groups.linkGuest('u-app', code)).rejects.toMatchObject({
        status: 409,
        response: { code: 'ALREADY_MEMBER', details: { canMerge: true, guestName: 'ann', myName: 'app' } },
      });
      expect(store.has(`grp:link:${code}`)).toBe(true);

      const detail = await groups.linkGuest('u-app', code, { merge: true });
      expect(detail.myMemberId).toBe(APP);
      expectPreserved(before, balances(t), ANN, APP);
      expect(row(ANN)).toEqual(expect.objectContaining({ mergedIntoMemberId: APP, removedAt: expect.any(Date), claimTokenHash: null }));
      expect(row(APP).userId).toBe('u-app');
      expect(t.events).toEqual([expect.objectContaining({ kind: 'member_merged', actorMemberId: APP, subjectMemberId: ANN, targetMemberId: APP })]);
      // The browser cookie no longer acts as anyone, and the code is spent.
      expect(await guest.identify(guestGroup(), ANN_SECRET)).toBeNull();
      await expect(groups.linkGuest('u-app', code, { merge: true })).rejects.toMatchObject({ status: 410 });
    });

    it("the 409 offer carries the guest row's net balance in the group currency (numbers only)", async () => {
      addExpense(t, { paidBy: OWNER, amount: 40, split: 'equal', raw: [{ memberId: ANN }, { memberId: OWNER }] });
      const code = (await mint())!;
      await expect(groups.linkGuest('u-app', code)).rejects.toMatchObject({
        status: 409,
        response: { details: { canMerge: true, guestBalance: -20, currencyCode: 'PLN' } },
      });
    });

    it('a restored code keeps its REMAINING lifetime, never a fresh 10 minutes', async () => {
      const t0 = 1_800_000_000_000;
      const now = jest.spyOn(Date, 'now').mockReturnValue(t0);
      try {
        const code = (await mint())!; // expires at t0 + 600 s
        now.mockReturnValue(t0 + 500_000); // 100 s left
        cache.set.mockClear();
        await expect(groups.linkGuest('u-app', code)).rejects.toMatchObject({ status: 409 });
        expect(cache.set).toHaveBeenCalledWith(`grp:link:${code}`, expect.anything(), 100);
        // Past its original expiry it is not put back at all.
        const code2 = (await mint())!;
        now.mockReturnValue(t0 + 500_000 + 601_000);
        cache.set.mockClear();
        await expect(groups.linkGuest('u-app', code2)).rejects.toMatchObject({ status: 409 });
        expect(cache.set).not.toHaveBeenCalled();
      } finally {
        now.mockRestore();
      }
    });

    it('a restored code is bound to the user who got the 409: another user cannot redeem it with merge:true', async () => {
      const code = (await mint())!;
      await expect(groups.linkGuest('u-app', code)).rejects.toMatchObject({ status: 409 });
      await expect(groups.linkGuest('u-owner', code, { merge: true })).rejects.toMatchObject({ status: 410 });
      expect(row(ANN).removedAt).toBeNull();
      // The code was put back for its user, who can still merge.
      expect(store.has(`grp:link:${code}`)).toBe(true);
      const detail = await groups.linkGuest('u-app', code, { merge: true });
      expect(detail.myMemberId).toBe(APP);
      expect(row(ANN).removedAt).toEqual(expect.any(Date));
    });

    it('the merged guest is gone from the pickers and the event is on the guest page', async () => {
      const code = (await mint())!;
      await groups.linkGuest('u-app', code, { merge: true });
      const preview = await groups.preview('u-other', t.group.guestToken);
      expect(preview.unclaimed.map((m) => m.id)).not.toContain(ANN);
      const page = await groups.getActivity(G, undefined, 50, { guestView: true });
      expect(page.items).toEqual([expect.objectContaining({ kind: 'event', event: expect.objectContaining({ kind: 'member_merged', subjectName: 'ann', targetName: 'app' }) })]);
      const detail = await groups.getDetail(G, APP);
      expect(detail.members.map((m) => m.id)).not.toContain(ANN);
    });

    it('a rotated link kills the code (410), nothing merged', async () => {
      const code = (await mint())!;
      t.group.guestToken = 'f'.repeat(32);
      await expect(groups.linkGuest('u-app', code, { merge: true })).rejects.toMatchObject({ status: 410, response: { code: 'LINK_CODE_INVALID' } });
      expect(row(ANN).removedAt).toBeNull();
    });

    it('a claim reset after minting kills the code (410), nothing merged', async () => {
      const code = (await mint())!;
      await groups.resetClaim(G, OWNER, ANN);
      await expect(groups.linkGuest('u-app', code, { merge: true })).rejects.toMatchObject({ status: 410 });
      expect(row(ANN).removedAt).toBeNull();
      expect(t.events.filter((e) => e.kind === 'member_merged')).toHaveLength(0);
    });

    it('loses a race cleanly: the claim changing inside the transaction is a 410 and rolls back', async () => {
      const code = (await mint())!;
      const real = prisma.expenseGroup.update;
      prisma.expenseGroup.update = jest.fn(async (args: any) => {
        row(ANN).claimTokenHash = sha256Hex('z'.repeat(32)); // someone re-claimed the name meanwhile
        return real(args);
      });
      await expect(groups.linkGuest('u-app', code, { merge: true })).rejects.toMatchObject({ status: 410 });
      expect(row(ANN).removedAt).toBeNull();
      expect(t.group.ledgerVersion).toBe(7);
    });

    it('a caller whose own row was removed gets no merge offer and the code is not kept', async () => {
      row(APP).removedAt = new Date();
      const code = (await mint())!;
      await expect(groups.linkGuest('u-app', code)).rejects.toMatchObject({ status: 409, response: { details: { canMerge: false } } });
      expect(store.has(`grp:link:${code}`)).toBe(false);
      await expect(groups.linkGuest('u-app', code, { merge: true })).rejects.toMatchObject({ status: 410 });
    });

    it('without merge a non-member still links as before', async () => {
      const code = (await mint())!;
      await groups.linkGuest('u-new', code).catch(() => undefined);
      expect(row(ANN).userId).toBe('u-new');
      expect(row(ANN).removedAt).toBeNull();
    });
  });
});
