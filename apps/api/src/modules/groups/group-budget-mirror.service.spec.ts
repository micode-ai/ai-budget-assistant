import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GroupBudgetMirrorService } from './group-budget-mirror.service';
import { GroupBudgetMirrorCron } from './group-budget-mirror.cron';

/**
 * ABA-660: the budget mirror over a small in-memory Prisma. `$transaction` rolls every table back when
 * its callback throws, so "atomic" is observed on the data. Group ledger changes are simulated the way
 * GroupsService / GroupItemsService / GroupMergeService leave the tables (they are covered by their own
 * specs); what is tested here is that the mirror re-derives the personal books from whatever they wrote.
 */

type Row = Record<string, any>;
interface Db {
  members: Row[];
  groups: Row[];
  groupExpenses: Row[];
  shares: Row[];
  settlements: Row[];
  expenses: Row[];
  incomes: Row[];
  links: Row[];
  suggestions: Row[];
  accounts: Row[];
  accountMembers: Row[];
  categories: Row[];
  splitParticipants: Row[];
}

const G = 'g-1';
const ME = 'u-me';
const MEM = 'm-me';
const ANN = 'm-ann';
const BO = 'm-bo';
const ACC = 'a-main';
const CAT = 'c-food';
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const NOW = new Date('2026-10-19T10:00:00.000Z');

function cmp(value: unknown, cond: unknown): boolean {
  if (cond === undefined) return true;
  if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
    const c = cond as Row;
    if ('in' in c) return (c.in as unknown[]).includes(value);
    if ('not' in c) return c.not === null ? value !== null && value !== undefined : value !== c.not;
    const t = value instanceof Date ? value.getTime() : Number(value);
    if (value === null || value === undefined) return false;
    if (c.gte !== undefined && t < new Date(c.gte).getTime()) return false;
    if (c.lte !== undefined && t > new Date(c.lte).getTime()) return false;
    if (c.gt !== undefined && t <= new Date(c.gt).getTime()) return false;
    if (c.lt !== undefined && t >= new Date(c.lt).getTime()) return false;
    return true;
  }
  const a = value instanceof Date ? value.getTime() : (value ?? null);
  const b = cond instanceof Date ? cond.getTime() : cond;
  return a === b;
}

function makeDb(db: Db) {
  const rel: Record<string, (row: Row, cond: Row) => boolean> = {
    groupCashLink: (row, cond) => {
      const has = db.links.some((l) => l.expenseId === row.id || l.incomeId === row.id);
      return cond.is === null ? !has : has;
    },
    splitParticipants: (row, cond) =>
      !db.splitParticipants.some((p) => p.expenseId === row.id && (cond.none.cancelledAt === null ? p.cancelledAt == null : true)),
  };
  const matches = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'OR') return (v as Row[]).some((w) => matches(row, w));
      if (rel[k] && v && typeof v === 'object') return rel[k](row, v as Row);
      return cmp(row[k], v);
    });
  const apply = (row: Row, data: Row) => {
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (v !== null && typeof v === 'object' && !(v instanceof Date) && 'increment' in v) row[k] = (row[k] ?? 0) + v.increment;
      else row[k] = v;
    }
    row.updatedAt = new Date();
  };
  let seq = 0;
  const table = (name: keyof Db, opts: { expand?: (r: Row, args: Row) => Row; unique?: string[][]; defaults?: () => Row } = {}) => {
    const expand = opts.expand ?? ((r: Row) => ({ ...r }));
    const check = () => {
      for (const keys of opts.unique ?? []) {
        const seen = new Set<string>();
        for (const r of db[name]) {
          if (keys.some((k) => r[k] == null)) continue;
          const key = keys.map((k) => r[k]).join('|');
          if (seen.has(key)) throw Object.assign(new Error(`unique ${String(name)} ${keys}`), { code: 'P2002' });
          seen.add(key);
        }
      }
    };
    const create = (data: Row) => {
      const r = { id: `${String(name)}-${++seq}`, createdAt: new Date(), updatedAt: new Date(), ...(opts.defaults?.() ?? {}), ...data };
      db[name].push(r);
      try {
        check();
      } catch (e) {
        db[name].pop();
        throw e;
      }
      return r;
    };
    return {
      findMany: jest.fn(async (args: Row = {}) => {
        let rows = db[name].filter((r) => matches(r, args.where));
        if (args.cursor) rows = rows.filter((r) => r.id > args.cursor.id);
        if (args.orderBy?.id) rows = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
        if (args.take) rows = rows.slice(0, args.take);
        return rows.map((r) => expand(r, args));
      }),
      findFirst: jest.fn(async (args: Row = {}) => {
        const r = db[name].find((x) => matches(x, args.where));
        return r ? expand(r, args) : null;
      }),
      findUnique: jest.fn(async (args: Row = {}) => {
        const r = db[name].find((x) => matches(x, args.where));
        return r ? expand(r, args) : null;
      }),
      count: jest.fn(async (args: Row = {}) => db[name].filter((r) => matches(r, args.where)).length),
      create: jest.fn(async ({ data }: Row) => ({ ...create(data) })),
      createMany: jest.fn(async ({ data, skipDuplicates }: Row) => {
        let count = 0;
        for (const row of data) {
          try {
            create(row);
            count++;
          } catch (e) {
            if (!skipDuplicates) throw e;
          }
        }
        return { count };
      }),
      update: jest.fn(async ({ where, data }: Row) => {
        const r = db[name].find((x) => matches(x, where));
        if (!r) throw new Error(`update: no ${String(name)} row`);
        apply(r, data);
        check();
        return { ...r };
      }),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        const hit = db[name].filter((x) => matches(x, where));
        hit.forEach((r) => apply(r, data));
        check();
        return { count: hit.length };
      }),
      deleteMany: jest.fn(async ({ where }: Row = {}) => {
        const before = db[name].length;
        (db as any)[name] = db[name].filter((x) => !matches(x, where));
        return { count: before - db[name].length };
      }),
      upsert: jest.fn(async ({ where, create: c, update: u }: Row) => {
        const flat = Object.values(where)[0] as Row;
        const r = db[name].find((x) => matches(x, flat));
        if (r) {
          apply(r, u);
          return { ...r };
        }
        return { ...create(c) };
      }),
    };
  };

  const prisma: any = {
    expenseGroupMember: table('members', {
      expand: (r) => ({ ...r, group: db.groups.find((g) => g.id === r.groupId) }),
    }),
    groupExpense: table('groupExpenses', {
      expand: (r, args) => ({
        ...r,
        shares: db.shares.filter((s) => s.groupExpenseId === r.id && matches(s, args.select?.shares?.where)).map((s) => ({ ...s })),
      }),
    }),
    groupSettlement: table('settlements'),
    expense: table('expenses', {
      unique: [['accountId', 'clientId'], ['groupExpenseId', 'groupMemberId', 'accountId']],
      defaults: () => ({
        isDeleted: false,
        isDebt: false,
        isDebtRepayment: false,
        isSplitReceivable: false,
        isPlanned: false,
        syncVersion: 0,
        groupExpenseId: null,
        groupMemberId: null,
        groupShareAmount: null,
      }),
    }),
    income: table('incomes', {
      defaults: () => ({ isDeleted: false, isDebt: false, isDebtRepayment: false, isSplitReceivable: false, syncVersion: 0 }),
    }),
    groupCashLink: table('links', {
      unique: [['memberId', 'legKey'], ['expenseId'], ['incomeId']],
      expand: (r) => ({
        ...r,
        expense: r.expenseId ? { ...(db.expenses.find((e) => e.id === r.expenseId) ?? {}) } : null,
        income: r.incomeId ? { ...(db.incomes.find((e) => e.id === r.incomeId) ?? {}) } : null,
      }),
    }),
    groupCashSuggestion: table('suggestions', {
      unique: [['memberId', 'legKey', 'candidateKey']],
      defaults: () => ({ status: 'open' }),
      expand: (r) => ({
        ...r,
        expense: r.expenseId ? db.expenses.find((e) => e.id === r.expenseId) ?? null : null,
        income: r.incomeId ? db.incomes.find((e) => e.id === r.incomeId) ?? null : null,
      }),
    }),
    account: table('accounts', {
      expand: (r, args) => ({
        ...r,
        members: db.accountMembers.filter((m) => m.accountId === r.id && matches(m, args.select?.members?.where)),
      }),
    }),
    accountMember: table('accountMembers'),
    category: table('categories'),
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => {
      const snapshot = structuredClone(db);
      try {
        return await fn(prisma);
      } catch (e) {
        for (const k of Object.keys(snapshot) as (keyof Db)[]) (db as any)[k] = snapshot[k];
        throw e;
      }
    }),
  };
  return prisma;
}

function baseDb(): Db {
  return {
    groups: [{ id: G, name: 'Flat', currencyCode: 'PLN' }, { id: 'g-2', name: 'Other', currencyCode: 'PLN' }],
    members: [
      { id: MEM, groupId: G, userId: ME, displayName: 'Me', removedAt: null, budgetMirrorFrom: null, budgetAccountId: null, budgetCategoryId: null },
      { id: ANN, groupId: G, userId: null, displayName: 'Ann', removedAt: null, budgetMirrorFrom: null, budgetAccountId: null, budgetCategoryId: null },
      { id: BO, groupId: G, userId: 'u-bo', displayName: 'Bo', removedAt: null, budgetMirrorFrom: null, budgetAccountId: null, budgetCategoryId: null },
      { id: 'm-foreign', groupId: 'g-2', userId: ME, displayName: 'Me', removedAt: null, budgetMirrorFrom: null, budgetAccountId: null, budgetCategoryId: null },
    ],
    groupExpenses: [],
    shares: [],
    settlements: [],
    expenses: [],
    incomes: [],
    links: [],
    suggestions: [],
    accounts: [
      { id: ACC, isActive: true, encryptionTier: 0, currencyCode: 'PLN', type: 'personal', tripStatus: null },
      { id: 'a-viewer', isActive: true, encryptionTier: 0, currencyCode: 'PLN', type: 'shared', tripStatus: null },
      { id: 'a-e2ee1', isActive: true, encryptionTier: 1, currencyCode: 'PLN', type: 'personal', tripStatus: null },
      { id: 'a-e2ee2', isActive: true, encryptionTier: 2, currencyCode: 'PLN', type: 'personal', tripStatus: null },
      { id: 'a-foreign', isActive: true, encryptionTier: 0, currencyCode: 'PLN', type: 'personal', tripStatus: null },
      { id: 'a-eur', isActive: true, encryptionTier: 0, currencyCode: 'EUR', type: 'personal', tripStatus: null },
    ],
    accountMembers: [
      { accountId: ACC, userId: ME, role: 'owner' },
      { accountId: 'a-viewer', userId: ME, role: 'viewer' },
      { accountId: 'a-e2ee1', userId: ME, role: 'owner' },
      { accountId: 'a-e2ee2', userId: ME, role: 'owner' },
      { accountId: 'a-eur', userId: ME, role: 'editor' },
      { accountId: 'a-foreign', userId: 'u-stranger', role: 'owner' },
    ],
    categories: [
      { id: CAT, accountId: ACC, type: 'expense', isDeleted: false, isSystem: false },
      { id: 'c-foreign', accountId: 'a-foreign', type: 'expense', isDeleted: false, isSystem: false },
    ],
    splitParticipants: [],
  };
}

describe('GroupBudgetMirrorService (ABA-660)', () => {
  let db: Db;
  let prisma: any;
  let rates: { getRates: jest.Mock };
  let cache: any;
  let svc: GroupBudgetMirrorService;

  /** A group expense as GroupsService writes it: amount in the group currency, shares resolved. */
  const addGroupExpense = (id: string, paidBy: string, shares: Record<string, number>, over: Row = {}) => {
    const amount = Object.values(shares).reduce((s, v) => s + v, 0);
    db.groupExpenses.push({
      id,
      groupId: G,
      description: over.description ?? 'Pizza',
      amount,
      date: over.date ?? d('2026-10-05'),
      originalAmount: over.originalAmount ?? null,
      originalCurrency: over.originalCurrency ?? null,
      paidByMemberId: paidBy,
      createdByMemberId: over.createdBy ?? paidBy,
      deletedAt: null,
    });
    for (const [memberId, shareAmount] of Object.entries(shares)) db.shares.push({ groupExpenseId: id, memberId, shareAmount });
  };
  const setShares = (id: string, shares: Record<string, number>) => {
    db.shares = db.shares.filter((s) => s.groupExpenseId !== id);
    for (const [memberId, shareAmount] of Object.entries(shares)) db.shares.push({ groupExpenseId: id, memberId, shareAmount });
    const ge = db.groupExpenses.find((e) => e.id === id)!;
    ge.amount = Object.values(shares).reduce((s, v) => s + v, 0);
  };
  const personal = (id: string, over: Row = {}) => {
    db.expenses.push({
      id,
      clientId: id,
      userId: ME,
      accountId: ACC,
      amount: 200,
      currencyCode: 'PLN',
      date: d('2026-10-05'),
      description: 'Card',
      merchant: 'PIZZERIA',
      source: 'notification',
      isDeleted: false,
      isDebt: false,
      isDebtRepayment: false,
      isSplitReceivable: false,
      isPlanned: false,
      syncVersion: 0,
      groupExpenseId: null,
      groupMemberId: null,
      groupShareAmount: null,
      ...over,
    });
  };
  const income = (id: string, over: Row = {}) => {
    db.incomes.push({
      id,
      clientId: id,
      userId: ME,
      accountId: ACC,
      amount: 150,
      currencyCode: 'PLN',
      date: d('2026-10-10'),
      description: 'BLIK from Ann',
      source: 'import',
      isDeleted: false,
      isDebt: false,
      isDebtRepayment: false,
      isSplitReceivable: false,
      syncVersion: 0,
      ...over,
    });
  };
  const shareRows = () => db.expenses.filter((e) => e.source === 'group');
  const liveShareRows = () => shareRows().filter((e) => !e.isDeleted);
  /** What the account's budget counts: every live expense not excluded as a split receivable. */
  const counted = () =>
    Math.round(db.expenses.filter((e) => !e.isDeleted && !e.isSplitReceivable && e.accountId === ACC).reduce((s, e) => s + Number(e.amount), 0) * 100) / 100;
  const enable = (over: Row = {}) => svc.enable(G, MEM, ME, { accountId: ACC, categoryId: CAT, ...over } as any);

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    db = baseDb();
    prisma = makeDb(db);
    rates = { getRates: jest.fn(async () => ({ rates: { EUR: 1, PLN: 4.25 } })) };
    cache = { delByPrefix: jest.fn(async () => undefined), del: jest.fn(async () => undefined), setIfAbsent: jest.fn(async () => true) };
    svc = new GroupBudgetMirrorService(prisma, rates as any, cache);
  });
  afterEach(() => jest.useRealTimers());

  // ------------------------------------------------------------------ opt-in and authz

  describe('turning it on', () => {
    it('stores account, category and the first day of this month, then writes my share rows', async () => {
      addGroupExpense('ge-1', ANN, { [ANN]: 100, [MEM]: 50, [BO]: 50 });
      const view = await enable();
      expect(view).toEqual(expect.objectContaining({ status: 'active', accountId: ACC, categoryId: CAT, from: '2026-10-01', shareRowCount: 1 }));
      const [row] = liveShareRows();
      expect(row).toEqual(
        expect.objectContaining({
          accountId: ACC,
          userId: ME,
          amount: 50,
          currencyCode: 'PLN',
          categoryId: CAT,
          source: 'group',
          description: 'Flat: Pizza',
          groupExpenseId: 'ge-1',
          groupMemberId: MEM,
          groupShareAmount: 50,
        }),
      );
      expect(row.clientId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('does not dump history: an expense dated before this month is not mirrored', async () => {
      addGroupExpense('ge-old', ANN, { [ANN]: 10, [MEM]: 10 }, { date: d('2026-09-30') });
      await enable();
      expect(shareRows()).toHaveLength(0);
    });

    it('refuses an account I only view (403), writing nothing', async () => {
      addGroupExpense('ge-1', ANN, { [ANN]: 50, [MEM]: 50 });
      await expect(enable({ accountId: 'a-viewer' })).rejects.toMatchObject({ response: { code: 'MIRROR_ACCOUNT_READ_ONLY' } });
      expect(db.members.find((m) => m.id === MEM)!.budgetMirrorFrom).toBeNull();
      expect(db.expenses).toHaveLength(0);
    });

    it('answers a foreign or unknown account with one 404 (IDOR)', async () => {
      await expect(enable({ accountId: 'a-foreign', categoryId: undefined })).rejects.toBeInstanceOf(NotFoundException);
      await expect(enable({ accountId: '00000000-0000-0000-0000-000000000000', categoryId: undefined })).rejects.toMatchObject({
        response: { code: 'ACCOUNT_NOT_FOUND' },
      });
    });

    it('refuses an end-to-end encrypted account at tier 1 and tier 2', async () => {
      for (const accountId of ['a-e2ee1', 'a-e2ee2']) {
        await expect(enable({ accountId, categoryId: undefined })).rejects.toMatchObject({ response: { code: 'MIRROR_ACCOUNT_ENCRYPTED' } });
      }
      expect(db.expenses).toHaveLength(0);
    });

    it('refuses a category of another account', async () => {
      await expect(enable({ categoryId: 'c-foreign' })).rejects.toMatchObject({ response: { code: 'CATEGORY_NOT_FOUND' } });
    });

    it('refuses a member id of another group (the guard proves this group only)', async () => {
      await expect(svc.enable(G, 'm-foreign', ME, { accountId: ACC } as any)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('switching accounts tears the old one down in the same pass', async () => {
      addGroupExpense('ge-1', ANN, { [ANN]: 50, [MEM]: 50 });
      await enable();
      await enable({ accountId: 'a-eur', categoryId: undefined });
      const plnRows = shareRows().filter((r) => r.accountId === ACC);
      expect(plnRows.every((r) => r.isDeleted && r.groupExpenseId === null)).toBe(true);
      expect(liveShareRows()).toEqual([expect.objectContaining({ accountId: 'a-eur', currencyCode: 'EUR', amount: 11.76 })]);
    });
  });

  // ------------------------------------------------------------------ share rows follow the ledger

  describe('share rows follow every ledger change', () => {
    beforeEach(async () => {
      addGroupExpense('ge-1', ANN, { [ANN]: 100, [MEM]: 50, [BO]: 50 });
      await enable();
    });

    it('create: a new expense with my share gets its row', async () => {
      addGroupExpense('ge-2', BO, { [BO]: 20, [MEM]: 20 }, { description: 'Taxi' });
      await svc.reconcileGroup(G);
      expect(liveShareRows().map((r) => [r.groupExpenseId, r.amount])).toEqual([['ge-1', 50], ['ge-2', 20]]);
    });

    it('edit: a moved share re-prices the row, a moved date re-dates it, my category stays', async () => {
      const row = liveShareRows()[0];
      row.categoryId = 'c-mine'; // the user re-categorised it
      setShares('ge-1', { [ANN]: 80, [MEM]: 70, [BO]: 50 });
      db.groupExpenses[0].date = d('2026-10-07');
      await svc.reconcileMember(MEM);
      expect(liveShareRows()).toEqual([expect.objectContaining({ amount: 70, groupShareAmount: 70, categoryId: 'c-mine', syncVersion: 1 })]);
      expect(liveShareRows()[0].date.toISOString()).toBe('2026-10-07T00:00:00.000Z');
    });

    it('delete: a deleted group expense soft-deletes and detaches my row', async () => {
      db.groupExpenses[0].deletedAt = new Date();
      await svc.reconcileMember(MEM);
      expect(liveShareRows()).toHaveLength(0);
      expect(shareRows()[0]).toEqual(expect.objectContaining({ isDeleted: true, groupExpenseId: null, groupMemberId: null }));
    });

    it('itemised claims: my share going to 0 removes the row, coming back creates a fresh one', async () => {
      setShares('ge-1', { [ANN]: 150, [BO]: 50 });
      await svc.reconcileMember(MEM);
      expect(liveShareRows()).toHaveLength(0);
      setShares('ge-1', { [ANN]: 120, [MEM]: 30, [BO]: 50 });
      await svc.reconcileMember(MEM);
      expect(liveShareRows()).toEqual([expect.objectContaining({ amount: 30, groupExpenseId: 'ge-1' })]);
    });

    it('merge: absorbing a guest moves its share into mine and the row follows', async () => {
      // GroupMergeService sums `from`'s share row into `into`'s (ABA-657).
      setShares('ge-1', { [ANN]: 100, [MEM]: 100 });
      await svc.reconcileMember(MEM);
      expect(liveShareRows()).toEqual([expect.objectContaining({ amount: 100 })]);
    });

    it('a row I deleted is "do not count this one": never recreated, never touched', async () => {
      liveShareRows()[0].isDeleted = true;
      setShares('ge-1', { [ANN]: 90, [MEM]: 60, [BO]: 50 });
      await svc.reconcileMember(MEM);
      expect(liveShareRows()).toHaveLength(0);
      expect(shareRows()).toHaveLength(1);
    });

    it('is idempotent: a second pass writes nothing', async () => {
      await svc.reconcileMember(MEM);
      const before = structuredClone(db);
      await svc.reconcileMember(MEM);
      expect(db).toEqual(before);
    });

    it('a concurrent create of the same row is absorbed by the unique key', async () => {
      addGroupExpense('ge-2', BO, { [BO]: 20, [MEM]: 20 });
      await Promise.all([svc.reconcileMember(MEM), svc.reconcileMember(MEM)]);
      expect(liveShareRows().filter((r) => r.groupExpenseId === 'ge-2')).toHaveLength(1);
    });
  });

  describe('multi-currency', () => {
    it('converts into the account currency once, and a later rate change never re-prices it', async () => {
      addGroupExpense('ge-1', ANN, { [ANN]: 42.5, [MEM]: 42.5 });
      await enable({ accountId: 'a-eur', categoryId: undefined });
      expect(liveShareRows()).toEqual([expect.objectContaining({ amount: 10, currencyCode: 'EUR', groupShareAmount: 42.5 })]);
      rates.getRates.mockResolvedValue({ rates: { EUR: 1, PLN: 5 } });
      await svc.reconcileMember(MEM);
      expect(liveShareRows()[0].amount).toBe(10);
      setShares('ge-1', { [ANN]: 35, [MEM]: 50 });
      await svc.reconcileMember(MEM);
      expect(liveShareRows()[0]).toEqual(expect.objectContaining({ amount: 10, currencyCode: 'EUR', groupShareAmount: 50 }));
    });

    it('with no rate the row keeps the group currency, never a mislabelled figure', async () => {
      rates.getRates.mockRejectedValue(new Error('provider down'));
      addGroupExpense('ge-1', ANN, { [ANN]: 42.5, [MEM]: 42.5 });
      await enable({ accountId: 'a-eur', categoryId: undefined });
      expect(liveShareRows()).toEqual([expect.objectContaining({ amount: 42.5, currencyCode: 'PLN' })]);
    });

    it('a foreign-currency group expense is matched against the card in the currency it was paid in', async () => {
      // 20 EUR entered, stored as 85 PLN (ABA-654). I paid; my share is 42.50 PLN.
      addGroupExpense('ge-1', MEM, { [MEM]: 42.5, [ANN]: 42.5 }, { originalAmount: 20, originalCurrency: 'EUR' });
      personal('card-eur', { amount: 20, currencyCode: 'EUR' });
      personal('card-pln', { amount: 85, currencyCode: 'PLN' });
      await enable();
      expect(db.links).toEqual([expect.objectContaining({ expenseId: 'card-eur', origin: 'auto' })]);
      expect(db.expenses.find((e) => e.id === 'card-pln')!.isSplitReceivable).toBe(false);
    });
  });

  // ------------------------------------------------------------------ cash legs

  describe('cash legs and the two tiers', () => {
    it('payer: my 200 card payment is auto-linked, so the budget counts my 50 share once', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 100, [BO]: 50 });
      personal('card', { date: d('2026-10-06') });
      await enable();
      expect(db.links).toEqual([expect.objectContaining({ kind: 'payer_expense', legKey: 'payer_expense:ge-1', expenseId: 'card', origin: 'auto' })]);
      expect(db.expenses.find((e) => e.id === 'card')).toEqual(expect.objectContaining({ isSplitReceivable: true, isDebt: false, syncVersion: 1 }));
      expect(counted()).toBe(50);
    });

    it('debtor: my settlement transfer is linked and excluded; the share is what counts', async () => {
      addGroupExpense('ge-1', ANN, { [ANN]: 150, [MEM]: 50 });
      db.settlements.push({ id: 's-1', recordedByMemberId: MEM, groupId: G, fromMemberId: MEM, toMemberId: ANN, amount: 50, createdAt: d('2026-10-08'), voidedAt: null });
      personal('blik', { amount: 50, date: d('2026-10-08'), source: 'import', description: 'BLIK to Ann' });
      await enable();
      expect(db.links).toEqual([expect.objectContaining({ kind: 'settlement_out', expenseId: 'blik' })]);
      expect(counted()).toBe(50);
    });

    it('creditor: the incoming settlement is linked as an income and flagged', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      db.settlements.push({ id: 's-in', recordedByMemberId: MEM, groupId: G, fromMemberId: ANN, toMemberId: MEM, amount: 150, createdAt: d('2026-10-10'), voidedAt: null });
      personal('card', {});
      income('blik-in', {});
      await enable();
      expect(db.links.map((l) => l.kind).sort()).toEqual(['payer_expense', 'settlement_in']);
      expect(db.incomes[0].isSplitReceivable).toBe(true);
      expect(counted()).toBe(50);
    });

    it('two exact candidates are suggestions, not a guess; accepting one links it and clears the rest', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      personal('c1', { date: d('2026-10-05') });
      personal('c2', { date: d('2026-10-06') });
      await enable();
      expect(db.links).toHaveLength(0);
      let view = await svc.getLinks(G, MEM, ME);
      expect(view.suggestions.map((s) => s.personal.expenseId).sort()).toEqual(['c1', 'c2']);
      expect(view.unlinked).toEqual([expect.objectContaining({ kind: 'payer_expense', groupExpenseId: 'ge-1', label: 'Pizza', amount: 200 })]);
      const pick = view.suggestions.find((s) => s.personal.expenseId === 'c2')!;
      view = await svc.acceptSuggestion(G, MEM, ME, pick.id);
      expect(view.links).toEqual([expect.objectContaining({ origin: 'user', personal: expect.objectContaining({ expenseId: 'c2' }) })]);
      expect(view.suggestions).toEqual([]);
      expect(view.unlinked).toEqual([]);
      expect(counted()).toBe(250); // share 50 + c1, an unrelated 200 that stays counted
    });

    it('a near match (a tip) is only a suggestion', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      personal('tip', { amount: 215 });
      await enable();
      expect(db.links).toHaveLength(0);
      expect(db.suggestions).toEqual([expect.objectContaining({ candidateKey: 'e:tip', status: 'open' })]);
    });

    it('a rejected suggestion stays rejected and the row is never auto-linked later', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      personal('c1');
      personal('c2');
      await enable();
      const [s1, s2] = (await svc.getLinks(G, MEM, ME)).suggestions;
      await svc.rejectSuggestion(G, MEM, ME, s1.id);
      await svc.rejectSuggestion(G, MEM, ME, s2.id);
      await svc.reconcileMember(MEM);
      expect(db.links).toHaveLength(0);
      expect((await svc.getLinks(G, MEM, ME)).suggestions).toEqual([]);
    });

    it('unlinking an auto link counts the row again and sticks', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      personal('card');
      await enable();
      const link = db.links[0];
      const view = await svc.unlink(G, MEM, ME, link.id);
      expect(view.links).toEqual([]);
      expect(db.expenses.find((e) => e.id === 'card')!.isSplitReceivable).toBe(false);
      await svc.reconcileMember(MEM);
      expect(db.links).toHaveLength(0);
      expect(counted()).toBe(250);
    });

    it('never links a debt, a repayment, a planned purchase, a flagged row, a share row or a split receipt', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      personal('debt', { isDebt: true });
      personal('repay', { isDebtRepayment: true });
      personal('planned', { isPlanned: true });
      personal('flagged', { isSplitReceivable: true });
      personal('split');
      db.splitParticipants.push({ expenseId: 'split', cancelledAt: null });
      personal('other-user', { userId: 'u-bo' });
      personal('other-account', { accountId: 'a-eur' });
      await enable();
      expect(db.links).toHaveLength(0);
      expect(db.suggestions).toHaveLength(0);
    });

    it('a cancelled receipt split does not block the row', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      personal('was-split');
      db.splitParticipants.push({ expenseId: 'was-split', cancelledAt: new Date() });
      await enable();
      expect(db.links).toEqual([expect.objectContaining({ expenseId: 'was-split' })]);
    });

    it('a leg that disappears (voided settlement) unlinks and counts the row again', async () => {
      addGroupExpense('ge-1', ANN, { [ANN]: 150, [MEM]: 50 });
      db.settlements.push({ id: 's-1', recordedByMemberId: MEM, groupId: G, fromMemberId: MEM, toMemberId: ANN, amount: 50, createdAt: d('2026-10-08'), voidedAt: null });
      personal('blik', { amount: 50, date: d('2026-10-08') });
      await enable();
      expect(db.links).toHaveLength(1);
      db.settlements[0].voidedAt = new Date();
      await svc.reconcileMember(MEM);
      expect(db.links).toHaveLength(0);
      expect(db.expenses.find((e) => e.id === 'blik')!.isSplitReceivable).toBe(false);
    });

    it('a linked row the user deleted frees the leg', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      personal('card');
      await enable();
      db.expenses.find((e) => e.id === 'card')!.isDeleted = true;
      await svc.reconcileMember(MEM);
      expect(db.links).toHaveLength(0);
      expect((await svc.getLinks(G, MEM, ME)).unlinked).toHaveLength(1);
    });
  });

  describe('manual links are re-scoped (IDOR)', () => {
    beforeEach(async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      addGroupExpense('ge-ann', ANN, { [ANN]: 50, [MEM]: 50 });
      db.groupExpenses.push({ id: 'ge-other', groupId: 'g-2', description: 'x', amount: 10, date: d('2026-10-05'), paidByMemberId: 'm-foreign', deletedAt: null });
      await enable();
    });

    it('links my leg to my row by hand', async () => {
      personal('mine', { amount: 199 });
      const view = await svc.createLink(G, MEM, ME, { kind: 'payer_expense', groupExpenseId: 'ge-1', expenseId: 'mine' });
      expect(view.links).toEqual([expect.objectContaining({ origin: 'user', personal: expect.objectContaining({ expenseId: 'mine' }) })]);
      expect(db.expenses.find((e) => e.id === 'mine')!.isSplitReceivable).toBe(true);
    });

    it('refuses another user`s row, a row of another account and a missing row with 404', async () => {
      personal('theirs', { userId: 'u-bo' });
      personal('elsewhere', { accountId: 'a-eur' });
      for (const expenseId of ['theirs', 'elsewhere', 'nope']) {
        await expect(svc.createLink(G, MEM, ME, { kind: 'payer_expense', groupExpenseId: 'ge-1', expenseId })).rejects.toMatchObject({
          response: { code: 'ROW_NOT_FOUND' },
        });
      }
      expect(db.expenses.some((e) => e.isSplitReceivable)).toBe(false);
    });

    it('refuses a leg that is not mine or not in this group with 404', async () => {
      personal('mine');
      for (const groupExpenseId of ['ge-ann', 'ge-other']) {
        await expect(svc.createLink(G, MEM, ME, { kind: 'payer_expense', groupExpenseId, expenseId: 'mine' })).rejects.toMatchObject({
          response: { code: 'LEG_NOT_FOUND' },
        });
      }
    });

    it('refuses an income for an expense leg and a row that is already a debt', async () => {
      income('inc');
      personal('debt', { isDebt: true });
      await expect(svc.createLink(G, MEM, ME, { kind: 'payer_expense', groupExpenseId: 'ge-1', incomeId: 'inc' } as any)).rejects.toMatchObject({
        response: { code: 'LINK_INVALID' },
      });
      await expect(svc.createLink(G, MEM, ME, { kind: 'payer_expense', groupExpenseId: 'ge-1', expenseId: 'debt' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(db.links).toHaveLength(0);
    });

    it('refuses a second link for the same leg', async () => {
      personal('a1', { amount: 1 });
      personal('a2', { amount: 2 });
      await svc.createLink(G, MEM, ME, { kind: 'payer_expense', groupExpenseId: 'ge-1', expenseId: 'a1' });
      await expect(svc.createLink(G, MEM, ME, { kind: 'payer_expense', groupExpenseId: 'ge-1', expenseId: 'a2' })).rejects.toMatchObject({
        response: { code: 'LEG_ALREADY_LINKED' },
      });
    });

    it('a suggestion or link id of another member is a 404', async () => {
      db.suggestions.push({ id: 'sg-x', memberId: BO, legKey: 'payer_expense:ge-1', candidateKey: 'e:z', expenseId: null, status: 'open' });
      db.links.push({ id: 'ln-x', memberId: BO, legKey: 'payer_expense:ge-1', kind: 'payer_expense', expenseId: null });
      await expect(svc.acceptSuggestion(G, MEM, ME, 'sg-x')).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.rejectSuggestion(G, MEM, ME, 'sg-x')).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.unlink(G, MEM, ME, 'ln-x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ------------------------------------------------------------------ paused, off

  describe('paused when the account can no longer be written', () => {
    beforeEach(async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      personal('card');
      await enable();
    });

    it('a viewer downgrade pauses it: nothing is written, link writes are 403', async () => {
      db.accountMembers.find((m) => m.accountId === ACC)!.role = 'viewer';
      addGroupExpense('ge-2', ANN, { [ANN]: 10, [MEM]: 10 });
      const before = structuredClone(db);
      expect(await svc.reconcileMember(MEM)).toBe('paused');
      expect(db).toEqual(before);
      expect((await svc.getMirror(G, MEM, ME)).status).toBe('paused');
      await expect(svc.unlink(G, MEM, ME, db.links[0].id)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('turning encryption on pauses it', async () => {
      db.accounts.find((a) => a.id === ACC)!.encryptionTier = 1;
      expect(await svc.reconcileMember(MEM)).toBe('paused');
      expect((await svc.getMirror(G, MEM, ME)).pausedReason).toBe('encrypted');
    });

    it('M1: turning it off while paused (still a member) removes share rows and clears every flag', async () => {
      db.accountMembers.find((m) => m.accountId === ACC)!.role = 'viewer';
      await svc.disable(G, MEM, ME);
      expect(liveShareRows()).toHaveLength(0);
      expect(db.expenses.find((e) => e.id === 'card')!.isSplitReceivable).toBe(false);
      expect(db.links).toHaveLength(0);
      expect(db.members.find((m) => m.id === MEM)!.budgetAccountId).toBeNull();
    });

    it('M1: no longer a member of the account: share rows stay, flags are still cleared, links dropped', async () => {
      db.accountMembers = db.accountMembers.filter((m) => !(m.accountId === ACC && m.userId === ME));
      await svc.disable(G, MEM, ME);
      expect(liveShareRows()).toHaveLength(1);
      expect(db.expenses.find((e) => e.id === 'card')!.isSplitReceivable).toBe(false);
      expect(db.links).toHaveLength(0);
      expect(db.members.find((m) => m.id === MEM)!.budgetAccountId).toBeNull();
    });

    it('L2: a flagged row that is a receipt with live split participants is never cleared', async () => {
      db.splitParticipants.push({ expenseId: 'card', cancelledAt: null });
      await svc.disable(G, MEM, ME);
      expect(db.expenses.find((e) => e.id === 'card')!.isSplitReceivable).toBe(true);
      expect(db.links).toHaveLength(0);
    });
  });

  describe('turning it off', () => {
    it('removes the share rows and unlinks every leg at once: back to the cash model', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      personal('card');
      await enable();
      expect(counted()).toBe(50);
      await svc.disable(G, MEM, ME);
      expect(liveShareRows()).toHaveLength(0);
      expect(db.links).toHaveLength(0);
      expect(db.expenses.find((e) => e.id === 'card')!.isSplitReceivable).toBe(false);
      expect(counted()).toBe(200);
      expect((await svc.getMirror(G, MEM, ME)).status).toBe('off');
    });

    it('rolls back everything when a write in the middle fails', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      personal('card');
      await enable();
      const before = structuredClone(db);
      prisma.groupCashSuggestion.deleteMany.mockRejectedValueOnce(new Error('boom'));
      await expect(svc.disable(G, MEM, ME)).rejects.toThrow('boom');
      expect(db).toEqual(before);
    });

    it('teardownGroup before a group delete counts the legs again', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      personal('card');
      await enable();
      await prisma.$transaction((tx: any) => svc.teardownGroup(tx, G));
      expect(liveShareRows()).toHaveLength(0);
      expect(counted()).toBe(200);
    });
  });

  describe('review fixes (ABA-660 security review)', () => {
    const flush = () => new Promise((r) => setImmediate(r));
    const turnOnDirectly = () => {
      const row = db.members.find((m) => m.id === MEM)!;
      row.budgetMirrorFrom = d('2026-10-01');
      row.budgetAccountId = ACC;
    };

    it('H1: a group expense someone else typed for me is only a suggestion, never an auto-link', async () => {
      addGroupExpense('ge-x', MEM, { [MEM]: 50, [ANN]: 150 }, { createdBy: ANN });
      personal('card', { date: d('2026-10-06') });
      await enable();
      expect(db.links).toHaveLength(0);
      expect(db.expenses.find((e) => e.id === 'card')!.isSplitReceivable).toBe(false);
      const view = await svc.getLinks(G, MEM, ME);
      expect(view.suggestions).toHaveLength(1);
      expect(view.suggestions[0].leg).toEqual(expect.objectContaining({ addedByOther: true, addedByName: 'Ann' }));
      expect(view.shareRows).toEqual([expect.objectContaining({ groupExpenseId: 'ge-x', addedByOther: true, addedByName: 'Ann' })]);
      expect(counted()).toBe(250);
    });

    it('H1: a settlement someone else recorded for me is only a suggestion', async () => {
      addGroupExpense('ge-1', ANN, { [ANN]: 150, [MEM]: 50 });
      db.settlements.push({ id: 's-x', recordedByMemberId: ANN, groupId: G, fromMemberId: MEM, toMemberId: ANN, amount: 50, createdAt: d('2026-10-08'), voidedAt: null });
      personal('blik', { amount: 50, date: d('2026-10-08'), source: 'import' });
      await enable();
      expect(db.links).toHaveLength(0);
      expect(db.suggestions).toEqual([expect.objectContaining({ kind: 'settlement_out', candidateKey: 'e:blik' })]);
    });

    it('H1: accepting the suggestion by hand still links it (the member decides)', async () => {
      addGroupExpense('ge-x', MEM, { [MEM]: 50, [ANN]: 150 }, { createdBy: ANN });
      personal('card');
      await enable();
      const [s1] = (await svc.getLinks(G, MEM, ME)).suggestions;
      await svc.acceptSuggestion(G, MEM, ME, s1.id);
      expect(db.links).toEqual([expect.objectContaining({ origin: 'user', expenseId: 'card' })]);
    });

    it('H1: a new suggestion from someone else pushes group_activity once (coalesced)', async () => {
      const sendToUser = jest.fn(async () => undefined);
      const pushing = new GroupBudgetMirrorService(prisma, rates as any, cache, { sendToUser } as any);
      addGroupExpense('ge-x', MEM, { [MEM]: 50, [ANN]: 150 }, { createdBy: ANN });
      personal('card');
      turnOnDirectly();
      await pushing.reconcileMember(MEM);
      await flush();
      expect(sendToUser).toHaveBeenCalledTimes(1);
      expect(sendToUser).toHaveBeenCalledWith(ME, expect.any(Function), expect.any(Function), { groupId: G }, 'group_activity');
      expect(cache.setIfAbsent).toHaveBeenCalledWith(`grp:sugg:${G}:${ME}`, 600);
      await pushing.reconcileMember(MEM); // the suggestion already exists: nothing new, no push
      await flush();
      expect(sendToUser).toHaveBeenCalledTimes(1);
    });

    it('H1: a suggestion for my own expense does not push', async () => {
      const sendToUser = jest.fn(async () => undefined);
      const pushing = new GroupBudgetMirrorService(prisma, rates as any, cache, { sendToUser } as any);
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      personal('c1');
      personal('c2');
      turnOnDirectly();
      await pushing.reconcileMember(MEM);
      await flush();
      expect(db.suggestions).toHaveLength(2);
      expect(sendToUser).not.toHaveBeenCalled();
    });

    it('H1: a failing push never breaks the pass', async () => {
      const failing = jest.fn(async () => {
        throw new Error('fcm');
      });
      const pushing = new GroupBudgetMirrorService(prisma, rates as any, cache, { sendToUser: failing } as any);
      addGroupExpense('ge-x', MEM, { [MEM]: 50, [ANN]: 150 }, { createdBy: ANN });
      personal('card');
      turnOnDirectly();
      await expect(pushing.reconcileMember(MEM)).resolves.toBe('active');
      await flush();
      expect(db.suggestions).toHaveLength(1);
    });

    it('H2: removing a member tears their mirror down in the same transaction', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      personal('card');
      await enable();
      expect(counted()).toBe(50);
      await prisma.$transaction(async (tx: any) => {
        await tx.expenseGroupMember.update({ where: { id: MEM }, data: { removedAt: new Date() } });
        await svc.teardownMember(tx, MEM);
      });
      expect(liveShareRows()).toHaveLength(0);
      expect(db.links).toHaveLength(0);
      expect(db.expenses.find((e) => e.id === 'card')!.isSplitReceivable).toBe(false);
      expect(db.members.find((m) => m.id === MEM)).toEqual(expect.objectContaining({ budgetAccountId: null, budgetMirrorFrom: null }));
      expect(counted()).toBe(200);
    });

    it('H2: the teardown rolls back with the removal when the transaction fails', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      personal('card');
      await enable();
      const before = structuredClone(db);
      await expect(
        prisma.$transaction(async (tx: any) => {
          await tx.expenseGroupMember.update({ where: { id: MEM }, data: { removedAt: new Date() } });
          await svc.teardownMember(tx, MEM);
          throw new Error('later step failed');
        }),
      ).rejects.toThrow('later step failed');
      expect(db).toEqual(before);
    });

    it('H2: teardownMember is a no-op for a member with no mirror and for a guest row', async () => {
      const before = structuredClone(db);
      await prisma.$transaction(async (tx: any) => {
        await svc.teardownMember(tx, MEM);
        await svc.teardownMember(tx, ANN);
      });
      expect(db).toEqual(before);
    });

    it('H2: a removed member can still disable (cleanup)', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      await enable();
      db.members.find((m) => m.id === MEM)!.removedAt = new Date();
      await svc.disable(G, MEM, ME);
      expect(liveShareRows()).toHaveLength(0);
    });

    describe('M3: a shared target account needs its owner', () => {
      beforeEach(() => {
        db.accounts.push(
          { id: 'a-shared', isActive: true, encryptionTier: 0, currencyCode: 'PLN', type: 'shared', tripStatus: null },
          { id: 'a-pair', isActive: true, encryptionTier: 0, currencyCode: 'PLN', type: 'personal', tripStatus: null },
        );
        db.accountMembers.push(
          { accountId: 'a-shared', userId: ME, role: 'editor' },
          { accountId: 'a-shared', userId: 'u-bo', role: 'owner' },
          { accountId: 'a-pair', userId: ME, role: 'editor' },
          { accountId: 'a-pair', userId: 'u-bo', role: 'owner' },
        );
      });

      it('an editor of a shared account is refused with 403 MIRROR_ACCOUNT_SHARED_NEEDS_OWNER', async () => {
        await expect(enable({ accountId: 'a-shared', categoryId: null })).rejects.toMatchObject({
          response: expect.objectContaining({ code: 'MIRROR_ACCOUNT_SHARED_NEEDS_OWNER' }),
        });
        await expect(enable({ accountId: 'a-shared', categoryId: null })).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('an editor of a personal account with more than one member is refused too', async () => {
        await expect(enable({ accountId: 'a-pair', categoryId: null })).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('the owner of a shared account may enable it; an editor of a single-member personal account too', async () => {
        db.accountMembers.find((m) => m.accountId === 'a-shared' && m.userId === ME)!.role = 'owner';
        await expect(enable({ accountId: 'a-shared', categoryId: null })).resolves.toEqual(expect.objectContaining({ status: 'active' }));
        await expect(enable({ accountId: 'a-eur', categoryId: null })).resolves.toEqual(expect.objectContaining({ status: 'active' }));
      });
    });

    it('M4: while paused getLinks returns only the mirror status', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      personal('card');
      await enable();
      db.accountMembers.find((m) => m.accountId === ACC)!.role = 'viewer';
      const view = await svc.getLinks(G, MEM, ME);
      expect(view.mirror.status).toBe('paused');
      expect(view.links).toEqual([]);
      expect(view.suggestions).toEqual([]);
      expect(view.unlinked).toEqual([]);
    });

    it('I1: the candidate read has a deterministic order (date desc, id asc)', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      personal('card');
      await enable();
      const calls = prisma.expense.findMany.mock.calls.filter((c: any[]) => c[0].take === 1000);
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) expect(c[0].orderBy).toEqual([{ date: 'desc' }, { id: 'asc' }]);
    });
  });

  describe('triggers', () => {
    it('afterPersonalWrite links a payment captured after the expense', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      await enable();
      personal('late-card', { date: d('2026-10-07') });
      await svc.reconcileForAccount(ACC, ME);
      expect(db.links).toEqual([expect.objectContaining({ expenseId: 'late-card' })]);
    });

    it('afterPersonalWrite for another account or user does nothing', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      await enable();
      personal('card');
      await svc.reconcileForAccount('a-eur', ME);
      await svc.reconcileForAccount(ACC, 'u-bo');
      expect(db.links).toHaveLength(0);
    });

    it('a removed member is no longer reconciled (its rows stay as they were)', async () => {
      addGroupExpense('ge-1', ANN, { [ANN]: 50, [MEM]: 50 });
      await enable();
      db.members.find((m) => m.id === MEM)!.removedAt = new Date();
      setShares('ge-1', { [ANN]: 100 });
      expect(await svc.reconcileMember(MEM)).toBe('off');
      expect(liveShareRows()).toHaveLength(1);
    });
  });

  // ------------------------------------------------------------------ the sweep

  describe('GroupBudgetMirrorCron', () => {
    it('re-derives a lost reconcile, and a second run changes nothing', async () => {
      addGroupExpense('ge-1', MEM, { [MEM]: 50, [ANN]: 150 });
      await enable();
      addGroupExpense('ge-2', ANN, { [ANN]: 30, [MEM]: 30 }); // a write whose post-commit call was lost
      personal('card');
      const cron = new GroupBudgetMirrorCron(prisma, svc);
      expect(await cron.run()).toEqual({ scanned: 1, active: 1, paused: 0, failed: 0 });
      expect(liveShareRows()).toHaveLength(2);
      expect(db.links).toHaveLength(1);
      const before = structuredClone(db);
      await cron.run();
      expect(db).toEqual(before);
    });

    it('streams members in id pages and survives one failing member', async () => {
      const ids = Array.from({ length: 1203 }, (_, i) => ({ id: `m-${String(i).padStart(5, '0')}` }));
      const pages: Row[] = [];
      const fakePrisma: any = {
        expenseGroupMember: {
          findMany: jest.fn(async (args: Row) => {
            pages.push(args);
            const start = args.cursor ? ids.findIndex((x) => x.id === args.cursor.id) + 1 : 0;
            return ids.slice(start, start + args.take);
          }),
        },
      };
      const mirror = {
        reconcileMember: jest.fn(async (id: string) => {
          if (id === 'm-00007') throw new Error('bad member');
          return id.endsWith('3') ? 'paused' : 'active';
        }),
      };
      const res = await new GroupBudgetMirrorCron(fakePrisma, mirror as any).run();
      expect(res.scanned).toBe(1203);
      expect(res.failed).toBe(1);
      expect(mirror.reconcileMember).toHaveBeenCalledTimes(1203);
      expect(pages).toHaveLength(3);
      expect(pages[0]).toEqual(expect.objectContaining({ take: 500, orderBy: { id: 'asc' } }));
      expect(pages[0].where).toEqual({ budgetMirrorFrom: { not: null }, removedAt: null, userId: { not: null } });
      expect(pages[1]).toEqual(expect.objectContaining({ cursor: { id: 'm-00499' }, skip: 1 }));
    });
  });
});
