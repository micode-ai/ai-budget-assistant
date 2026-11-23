import { AllAccountsService } from './all-accounts.service';

const acct = (id: string, tier = 0, extra: Record<string, unknown> = {}) => ({
  role: 'owner',
  account: { id, name: id, type: 'personal', encryptionTier: tier, _count: { members: 1 }, ...extra },
});
const cat = (name: string, systemKey: string | null = null, type = 'expense') => ({
  name,
  systemKey,
  nameCustomized: false,
  type,
  parent: null,
});
const exp = (o: Record<string, unknown> = {}) => ({
  accountId: 'A',
  amount: 10,
  currencyCode: 'PLN',
  date: new Date('2026-11-05T00:00:00Z'),
  description: 'x',
  isPlanned: false,
  isSplitReceivable: false,
  categoryId: 'c1',
  category: cat('Food'),
  categorySplits: [],
  ...o,
});
const inc = (o: Record<string, unknown> = {}) => ({
  id: 'i1',
  accountId: 'A',
  amount: 100,
  currencyCode: 'PLN',
  date: new Date('2026-11-06T00:00:00Z'),
  description: 'pay',
  isSplitReceivable: false,
  category: cat('Salary', null, 'income'),
  ...o,
});

function setup(opts: { members?: any[]; expenses?: any[]; incomes?: any[]; transfers?: any[]; rates?: Record<string, number> } = {}) {
  const prisma: any = {
    accountMember: { findMany: jest.fn().mockResolvedValue(opts.members ?? [acct('A'), acct('B')]) },
    expense: { findMany: jest.fn().mockResolvedValue(opts.expenses ?? []) },
    income: { findMany: jest.fn().mockResolvedValue(opts.incomes ?? []) },
    accountTransfer: { findMany: jest.fn().mockResolvedValue(opts.transfers ?? []) },
    user: { findUnique: jest.fn().mockResolvedValue({ language: 'en' }) },
  };
  const store = new Map<string, unknown>();
  const cache: any = {
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: unknown) => void store.set(k, v)),
  };
  const fx: any = { getRates: jest.fn().mockResolvedValue({ rates: opts.rates ?? { PLN: 1, EUR: 0.25 } }) };
  return { prisma, cache, fx, svc: new AllAccountsService(prisma, fx, cache) };
}

const none = { exclude: [], onlyAccountIds: null };

describe('AllAccountsService.loadLedger', () => {
  it('ignores exclude / onlyAccountIds ids the user is not a member of', async () => {
    const { svc, prisma } = setup();
    const r = await svc.loadLedger('u', 'PLN', 'en', '2026-11-01', '2026-11-30', { exclude: ['ZZ'], onlyAccountIds: ['A', 'ZZ'] });
    expect(r.includedIds).toEqual(['A']);
    expect(r.accounts.map((a) => a.id)).toEqual(['A', 'B']);
    expect(prisma.expense.findMany.mock.calls[0][0].where.accountId.in).toEqual(['A']);
  });

  it('tier 2 is listed encrypted and never queried; tier 1 loads with unreadable names', async () => {
    const { svc, prisma } = setup({
      members: [acct('A', 2), acct('B', 1)],
      expenses: [exp({ accountId: 'B', category: cat('Secret') })],
    });
    const r = await svc.loadLedger('u', 'PLN', 'en', '2026-11-01', '2026-11-30', none);
    expect(r.accounts.find((a) => a.id === 'A')).toMatchObject({ encrypted: true, included: false });
    expect(prisma.expense.findMany.mock.calls[0][0].where.accountId.in).toEqual(['B']);
    expect(r.rows[0].category.key).toBe('expense:__other');
  });

  it('marks planned and split-receivable expenses with a note but still loads them', async () => {
    const { svc } = setup({ expenses: [exp({ isPlanned: true }), exp({ isSplitReceivable: true }), exp()] });
    const r = await svc.loadLedger('u', 'PLN', 'en', '2026-11-01', '2026-11-30', none);
    expect(r.rows.map((x) => x.note)).toEqual(['planned', 'splitReceivable', null]);
  });

  it('flags a countAsIncome transfer income only when the source account is included', async () => {
    const both = setup({ incomes: [inc({ accountId: 'B' })], transfers: [{ linkedIncomeId: 'i1' }] });
    const r1 = await both.svc.loadLedger('u', 'PLN', 'en', '2026-11-01', '2026-11-30', none);
    expect(r1.rows[0].note).toBe('internalTransfer');

    // With A excluded the loader only asks about transfers FROM included accounts.
    const excl = setup({ incomes: [inc({ accountId: 'B' })], transfers: [] });
    const r2 = await excl.svc.loadLedger('u', 'PLN', 'en', '2026-11-01', '2026-11-30', { exclude: ['A'], onlyAccountIds: null });
    expect(excl.prisma.accountTransfer.findMany.mock.calls[0][0].where.fromAccountId.in).toEqual(['B']);
    expect(r2.rows[0].note).toBeNull();
  });

  it('emits one row per category split', async () => {
    const { svc } = setup({
      expenses: [
        exp({
          amount: 30,
          categorySplits: [
            { categoryId: 'c1', amount: 10, category: cat('Food') },
            { categoryId: 'c2', amount: 20, category: cat('Home') },
          ],
        }),
      ],
    });
    const r = await svc.loadLedger('u', 'PLN', 'en', '2026-11-01', '2026-11-30', none);
    expect(r.rows.map((x) => [x.category.name, x.amount])).toEqual([
      ['Food', 10],
      ['Home', 20],
    ]);
  });

  it('converts to base and yields null for an unknown currency', async () => {
    const { svc } = setup({ expenses: [exp({ currencyCode: 'EUR', amount: 5 }), exp({ currencyCode: 'XXX' })] });
    const r = await svc.loadLedger('u', 'PLN', 'en', '2026-11-01', '2026-11-30', none);
    expect(r.rows[0].amountBase).toBe(20);
    expect(r.rows[1].amountBase).toBeNull();
  });

  it('flags shared accounts (type or member count)', async () => {
    const { svc } = setup({ members: [acct('A'), acct('B', 0, { type: 'trip' }), acct('C', 0, { _count: { members: 3 } })] });
    const r = await svc.loadLedger('u', 'PLN', 'en', '2026-11-01', '2026-11-30', none);
    expect(r.accounts.map((a) => a.shared)).toEqual([false, true, true]);
  });
});

describe('AllAccountsService.getAnalytics', () => {
  it('computes previous-period figures and caches the result', async () => {
    const { svc, prisma, cache } = setup();
    prisma.expense.findMany.mockImplementation(async ({ where }: any) =>
      where.date.gte.toISOString().startsWith('2026-11-01') ? [exp({ amount: 50 })] : [exp({ amount: 20, date: new Date('2026-10-05T00:00:00Z') })],
    );
    const q = { start: '2026-11-01', end: '2026-11-30', exclude: [], onlyAccountIds: null, groupId: null };
    const r = await svc.getAnalytics({ id: 'u', currencyCode: 'PLN' }, q);
    const a = r.accounts.find((x) => x.id === 'A')!;
    expect(a.spent).toBe(50);
    expect(a.prevSpent).toBe(20);
    expect(r.totals.spent).toBe(50);
    expect(cache.set).toHaveBeenCalledWith('aa:u:PLN:en:2026-11-01:2026-11-30:A,B', expect.anything(), 120);

    const calls = prisma.expense.findMany.mock.calls.length;
    const again = await svc.getAnalytics({ id: 'u', currencyCode: 'PLN' }, q);
    expect(again).toEqual(r);
    expect(prisma.expense.findMany.mock.calls.length).toBe(calls);
  });
});
