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
    expect(cacheSet).toHaveBeenCalledWith(realSalaryCacheKey('acc', 'u1', 'PLN'), r, 3600);
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

  it('the resolved country is reported even when there is no official data for it', async () => {
    const { svc } = make({
      official: null, profile: { salaryKey: KEY, manualPreviousMonthly: 8000 },
      incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: spend,
    });
    const r = await svc.compute('acc', 'u1', 'PLN');
    expect(r).toMatchObject({ status: 'no_inflation_source', country: 'PL', countryGuessed: true });
  });

  it('a receipts-only answer keeps the country and flags only dataMonth', async () => {
    const foodSpend = spend.map((e) => ({ ...e, categoryId: 'cat-food', category: { id: 'cat-food', name: 'Food', coicopDivision: 'CP01' } }));
    const { svc } = make({
      official: null, profile: { salaryKey: KEY, manualPreviousMonthly: 8000 },
      incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: foodSpend,
      receipt: { inflationIndex: 3, productCount: 25 },
    });
    const r = await svc.compute('acc', 'u1', 'PLN');
    expect(r).toMatchObject({ status: 'ready', country: 'PL', countryGuessed: true, dataMonth: null });
  });

  it('returns the cached response without recomputing', async () => {
    const cached = { status: 'ready' };
    const { svc, prisma } = make({ cached });
    await expect(svc.compute('acc', 'u1', 'PLN')).resolves.toBe(cached);
    expect(prisma.account.findUnique).toHaveBeenCalled();
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

describe('RealSalaryService — salary comes from every account the caller belongs to', () => {
  // A salary paid into a personal account and moved to a shared Family account
  // by transfer is not an income there — the Family view must still find it.
  const expectedIncomeWhere = {
    userId: 'u1',
    isDeleted: false,
    account: { isActive: true, encryptionTier: { lt: 2 }, members: { some: { userId: 'u1' } } },
  };

  it('compute reads the caller\'s own incomes across their active accounts, not the open account\'s', async () => {
    const { svc, prisma } = make({
      profile: { salaryKey: KEY, manualPreviousMonthly: 8000 }, incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: spend,
    });
    await svc.compute('family', 'u1', 'PLN');
    const where = prisma.income.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject(expectedIncomeWhere);
    expect(where.accountId).toBeUndefined();
    // Spend still weighs the open account.
    expect(prisma.expense.findMany.mock.calls[0][0].where.accountId).toBe('family');
  });

  it('getProfile suggests candidates from the same cross-account income set', async () => {
    const { svc, prisma } = make({ incomes: [1, 2, 3].map((n) => salary(n, 8400)) });
    const r = await svc.getProfile('family', 'u1');
    expect(prisma.income.findMany.mock.calls[0][0].where).toMatchObject(expectedIncomeWhere);
    expect(r.candidates.map((c) => c.key)).toContain(KEY);
  });
});

describe('RealSalaryService.compute — cache scoping and correctness', () => {
  it('two members of one account do not share a cached answer', async () => {
    const { svc, cache, cacheSet } = make({
      profile: { salaryKey: KEY, manualPreviousMonthly: 8000 },
      incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: spend,
    });
    await svc.compute('acc', 'u1', 'PLN');
    await svc.compute('acc', 'u2', 'PLN');
    expect(cache.get).toHaveBeenCalledWith(realSalaryCacheKey('acc', 'u1', 'PLN'));
    expect(cache.get).toHaveBeenCalledWith(realSalaryCacheKey('acc', 'u2', 'PLN'));
    expect(cacheSet).toHaveBeenCalledWith(realSalaryCacheKey('acc', 'u1', 'PLN'), expect.anything(), 3600);
    expect(cacheSet).toHaveBeenCalledWith(realSalaryCacheKey('acc', 'u2', 'PLN'), expect.anything(), 3600);
  });

  it('a non-ready answer is not cached', async () => {
    const { svc, cacheSet } = make({
      profile: { salaryKey: KEY, manualPreviousMonthly: 8000 },
      incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: spend.slice(0, 2),
    });
    const r = await svc.compute('acc', 'u1', 'PLN');
    expect(r.status).toBe('spend_under_3_months');
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('an encrypted account is never served from the cache', async () => {
    const { svc, cache } = make({ encryptionTier: 2, cached: { status: 'ready' } });
    const r = await svc.compute('acc', 'u1', 'PLN');
    expect(r.status).toBe('encrypted');
    expect(cache.get).not.toHaveBeenCalled();
  });

  it("a split weighs the split's own category division", async () => {
    const splitSpend = Array.from({ length: 3 }, (_, i) => ({
      amount: 1000, currencyCode: 'PLN', date: monthsAgo(i + 1), categoryId: 'cat-food',
      category: { id: 'cat-food', name: 'Food', coicopDivision: 'CP01' },
      categorySplits: [
        { categoryId: 'cat-rent', amount: 1000, category: { id: 'cat-rent', name: 'Rent', coicopDivision: 'CP04' } },
      ],
    }));
    const { svc } = make({
      profile: { salaryKey: KEY, manualPreviousMonthly: 8000 },
      incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)),
      expenses: splitSpend,
      official: { month: '2026-08', rates: { TOTAL: 3.5, CP01: -0.8, CP04: 5.1 } },
    });
    const r = await svc.compute('acc', 'u1', 'PLN');
    const divisions = r.breakdown.map((b) => b.division);
    expect(divisions).toContain('CP04');
    expect(divisions).not.toContain('CP01');
  });

  it('an expense with no FX rate is excluded and flagged', async () => {
    const { svc: baselineSvc } = make({
      profile: { salaryKey: KEY, manualPreviousMonthly: 8000 },
      incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: spend,
    });
    const baseline = await baselineSvc.compute('acc', 'u1', 'PLN');

    const foreignSpend = [{
      amount: 500, currencyCode: 'EUR', date: monthsAgo(1), categoryId: 'cat-rent',
      category: { id: 'cat-rent', name: 'Rent', coicopDivision: 'CP04' }, categorySplits: [],
    }];
    const { svc } = make({
      profile: { salaryKey: KEY, manualPreviousMonthly: 8000 },
      incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: [...spend, ...foreignSpend],
    });
    const r = await svc.compute('acc', 'u1', 'PLN');
    expect(r.fxApproximate).toBe(true);
    expect(r.personalInflationPct).toBe(baseline.personalInflationPct);
  });

  it('a foreign-currency salary is compared in its own currency', async () => {
    const eurKey = 'cat-sal|wynagrodzenie acme|EUR';
    const { svc } = make({
      profile: { salaryKey: eurKey, manualPreviousMonthly: 2000 },
      incomes: [1, 2, 3, 4].map((n) => ({ ...salary(n, 2100), currencyCode: 'EUR' })),
      expenses: spend,
    });
    const r = await svc.compute('acc', 'u1', 'PLN');
    expect(r.status).toBe('ready');
    expect(r.nominalChangePct).toBe(5);
  });

  it('the half-year receipt index is annualised before it replaces CP01', async () => {
    const foodSpend = spend.map((e) => ({ ...e, categoryId: 'cat-food', category: { id: 'cat-food', name: 'Food', coicopDivision: 'CP01' } }));
    const { svc } = make({
      profile: { salaryKey: KEY, manualPreviousMonthly: 8000 },
      incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: foodSpend,
      receipt: { inflationIndex: 3, productCount: 25 },
    });
    const r = await svc.compute('acc', 'u1', 'PLN');
    expect(r.breakdown.find((b) => b.division === 'CP01')).toMatchObject({ ratePct: 6.1, source: 'receipts' });
  });

  it('an invalid inflationCountry falls back to the timezone guess', async () => {
    const { svc, official } = make({
      inflationCountry: 'GR', timezone: 'Europe/Warsaw',
      profile: { salaryKey: KEY, manualPreviousMonthly: 8000 },
      incomes: [1, 2, 3, 4].map((n) => salary(n, 8400)), expenses: spend,
    });
    const r = await svc.compute('acc', 'u1', 'PLN');
    expect(official.latestFor).toHaveBeenCalledWith('PL');
    expect(r.countryGuessed).toBe(true);
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

  it('getProfile returns the stored profile and the detected candidates', async () => {
    const { svc } = make({ profile: { salaryKey: KEY, manualPreviousMonthly: null }, incomes: [1, 2].map((n) => salary(n, 8400)) });
    const r = await svc.getProfile('acc', 'u1');
    expect(r.profile).toEqual({ salaryKey: KEY, manualPreviousMonthly: null });
    expect(r.candidates.map((c) => c.key)).toEqual([KEY]);
  });
});
