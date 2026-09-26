import { RealSalaryService, realSalaryCacheKey } from '../real-salary.service';

const NOW = new Date();
const monthsAgo = (n: number, day = 10) => new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - n, day));
const salary = (n: number, amount: number) => ({
  amount, currencyCode: 'PLN', date: monthsAgo(n), description: 'Wynagrodzenie ACME',
  categoryId: 'cat-sal', category: { name: 'Salary' }, isDebt: false, isDebtRepayment: false, clientId: `s${n}`,
});
const KEY = 'cat-sal|wynagrodzenie acme|PLN';

function make(o: {
  encryptionTier?: number; profile?: any; incomes?: any[]; expenses?: any[]; timezone?: string;
  inflationCountry?: string | null; official?: any; receipt?: { inflationIndex: number | null; productCount: number };
  cached?: any;
} = {}) {
  const cacheSet = jest.fn();
  const prisma: any = {
    account: { findUnique: jest.fn().mockResolvedValue({ encryptionTier: o.encryptionTier ?? 0 }) },
    user: { findUnique: jest.fn().mockResolvedValue({ timezone: o.timezone ?? 'Europe/Warsaw', inflationCountry: o.inflationCountry ?? null }) },
    salaryProfile: {
      findUnique: jest.fn().mockResolvedValue(o.profile ?? null),
      upsert: jest.fn().mockImplementation(({ create }: any) => Promise.resolve({ ...create })),
    },
    income: { findMany: jest.fn().mockResolvedValue(o.incomes ?? []) },
    expense: { findMany: jest.fn().mockResolvedValue(o.expenses ?? []) },
    category: { findMany: jest.fn().mockResolvedValue([]) },
    accountMember: { findMany: jest.fn().mockResolvedValue([{ accountId: 'acc' }, { accountId: 'acc2' }]) },
  };
  const cache: any = { get: jest.fn().mockResolvedValue(o.cached ?? null), set: cacheSet, delByPrefix: jest.fn() };
  const fx: any = { getRates: jest.fn().mockResolvedValue({ rates: {} }) };
  const priceHistory: any = { getPriceHistory: jest.fn().mockResolvedValue(o.receipt ?? { inflationIndex: null, productCount: 0 }) };
  const official: any = { latestFor: jest.fn().mockResolvedValue(o.official === undefined ? { month: '2026-08', rates: { TOTAL: 3.5, CP04: 5.1 } } : o.official) };
  const classifier: any = { ensureClassified: jest.fn().mockResolvedValue(undefined) };
  const svc = new RealSalaryService(prisma, cache, fx, priceHistory, official, classifier);
  return { svc, prisma, cache, cacheSet, official, classifier };
}

const spend = Array.from({ length: 6 }, (_, i) => ({
  amount: 1000, currencyCode: 'PLN', date: monthsAgo(i + 1), categoryId: 'cat-rent',
  category: { id: 'cat-rent', name: 'Rent', coicopDivision: 'CP04' }, categorySplits: [],
}));

describe('RealSalaryService.compute', () => {
  it('encrypted accounts get status encrypted and nothing is queried', async () => {
    const { svc, prisma } = make({ encryptionTier: 2 });
    const r = await svc.compute('acc', 'u1', 'PLN');
    expect(r.status).toBe('encrypted');
    expect(prisma.income.findMany).not.toHaveBeenCalled();
  });

  it('no confirmed salary → no_salary_confirmed', async () => {
    const { svc } = make({ expenses: spend });
    expect((await svc.compute('acc', 'u1', 'PLN')).status).toBe('no_salary_confirmed');
  });

  it('short salary history without a manual figure → salary_history_short', async () => {
    const { svc } = make({
      profile: { salaryKey: KEY, manualPreviousMonthly: null },
      incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: spend,
    });
    expect((await svc.compute('acc', 'u1', 'PLN')).status).toBe('salary_history_short');
  });

  it('under 3 months of spend → spend_under_3_months', async () => {
    const { svc } = make({
      profile: { salaryKey: KEY, manualPreviousMonthly: 8000 },
      incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: spend.slice(0, 2),
    });
    expect((await svc.compute('acc', 'u1', 'PLN')).status).toBe('spend_under_3_months');
  });

  it('ready: nominal from salary, inflation from official rates, cached', async () => {
    const { svc, cacheSet, official, classifier } = make({
      profile: { salaryKey: KEY, manualPreviousMonthly: 8000 },
      incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: spend,
    });
    const r = await svc.compute('acc', 'u1', 'PLN');
    expect(r).toMatchObject({
      status: 'ready', country: 'PL', countryGuessed: true, dataMonth: '2026-08',
      nominalChangePct: 5, personalInflationPct: 5.1, realChangePct: -0.1, requiredRaisePct: 0.1,
    });
    expect(official.latestFor).toHaveBeenCalledWith('PL');
    expect(classifier.ensureClassified).toHaveBeenCalledWith('acc');
    expect(cacheSet).toHaveBeenCalledWith(realSalaryCacheKey('acc', 'PLN'), r, 3600);
  });

  it('an explicit country beats the timezone guess', async () => {
    const { svc, official } = make({
      inflationCountry: 'DE', profile: { salaryKey: KEY, manualPreviousMonthly: 8000 },
      incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: spend,
    });
    const r = await svc.compute('acc', 'u1', 'PLN');
    expect(official.latestFor).toHaveBeenCalledWith('DE');
    expect(r.countryGuessed).toBe(false);
  });

  it('outside coverage with thin receipts → no_inflation_source', async () => {
    const { svc } = make({
      timezone: 'Europe/Kyiv', official: null, profile: { salaryKey: KEY, manualPreviousMonthly: 8000 },
      incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: spend,
    });
    const r = await svc.compute('acc', 'u1', 'PLN');
    expect(r.status).toBe('no_inflation_source');
    expect(r.country).toBeNull();
  });

  it('returns the cached response without recomputing', async () => {
    const cached = { status: 'ready' };
    const { svc, prisma } = make({ cached });
    await expect(svc.compute('acc', 'u1', 'PLN')).resolves.toBe(cached);
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });

  it('reads expenses with every exclusion and split rows', async () => {
    const { svc, prisma } = make({
      profile: { salaryKey: KEY, manualPreviousMonthly: 8000 }, incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: spend,
    });
    await svc.compute('acc', 'u1', 'PLN');
    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      accountId: 'acc', isDeleted: false, isDebt: false, isDebtRepayment: false, isPlanned: false, isSplitReceivable: false,
    });
    expect(where.date.gte).toBeInstanceOf(Date);
  });
});

describe('RealSalaryService profile + cache', () => {
  it('saveProfile upserts per user+account and busts the account cache', async () => {
    const { svc, prisma, cache } = make();
    await svc.saveProfile('acc', 'u1', { salaryKey: KEY, manualPreviousMonthly: 8000 });
    expect(prisma.salaryProfile.upsert).toHaveBeenCalledWith({
      where: { userId_accountId: { userId: 'u1', accountId: 'acc' } },
      create: { userId: 'u1', accountId: 'acc', salaryKey: KEY, manualPreviousMonthly: 8000 },
      update: { salaryKey: KEY, manualPreviousMonthly: 8000 },
    });
    expect(cache.delByPrefix).toHaveBeenCalledWith('rs:acc:');
  });

  it('bustUser clears every account the user belongs to', async () => {
    const { svc, cache } = make();
    await svc.bustUser('u1');
    expect(cache.delByPrefix).toHaveBeenCalledWith('rs:acc:');
    expect(cache.delByPrefix).toHaveBeenCalledWith('rs:acc2:');
  });

  it('getProfile returns the stored profile and the detected candidates', async () => {
    const { svc } = make({ profile: { salaryKey: KEY, manualPreviousMonthly: null }, incomes: [1, 2].map((n) => salary(n, 8400)) });
    const r = await svc.getProfile('acc', 'u1');
    expect(r.profile).toEqual({ salaryKey: KEY, manualPreviousMonthly: null });
    expect(r.candidates.map((c) => c.key)).toEqual([KEY]);
  });
});
