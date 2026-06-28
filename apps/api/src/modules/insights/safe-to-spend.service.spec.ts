import { SafeToSpendService, safeToSpendCacheKey } from './safe-to-spend.service';

// ---------------------------------------------------------------------------
// Lightweight stubs — no NestJS TestingModule needed for a pure-logic service.
// ---------------------------------------------------------------------------

function buildToday(year: number, month: number, day: number): Date {
  // month is 1-based for ergonomics in tests
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function makeService(overrides: {
  walletBalances?: Array<{ currencyCode: string; currentBalance: number }>;
  incomes?: Array<{ amount: number; currencyCode: string; description: string; date: Date }>;
  subscriptions?: Array<{ amount: number; currencyCode: string; billingCycle: string; nextRenewalDate: Date; isActive: boolean }>;
  recurringExpenses?: Array<{ recurringId: string; recurringPeriod: string; date: Date; amount: number; currencyCode: string }>;
  goals?: Array<{ id: string; name: string; targetAmount: number; currentAmount: number; currencyCode: string; deadline: Date; status: string }>;
  rates?: Record<string, number> | null;
}): SafeToSpendService {
  const {
    walletBalances = [],
    incomes = [],
    subscriptions = [],
    recurringExpenses = [],
    goals = [],
    rates = null,
  } = overrides;

  const prisma: any = {
    income: { findMany: jest.fn().mockResolvedValue(incomes) },
    userSubscription: { findMany: jest.fn().mockResolvedValue(subscriptions) },
    expense: {
      findMany: jest.fn().mockResolvedValue(
        recurringExpenses.map((e) => ({
          recurringId: e.recurringId,
          recurringPeriod: e.recurringPeriod,
          date: e.date,
          amount: String(e.amount),
          currencyCode: e.currencyCode,
        })),
      ),
    },
    savingsGoal: { findMany: jest.fn().mockResolvedValue(goals) },
  };

  const walletService: any = {
    getSummary: jest.fn().mockResolvedValue({ balances: walletBalances }),
  };

  const exchangeRateService: any = {
    getRates: jest.fn().mockImplementation(async () => {
      if (rates === null) throw new Error('No rates');
      return { rates };
    }),
  };

  const cacheService: any = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  };

  return new SafeToSpendService(prisma, walletService, exchangeRateService, cacheService);
}

// ---------------------------------------------------------------------------
// computeSafeToSpend helper (pure formula)
// ---------------------------------------------------------------------------
describe('computeSafeToSpend (shared-utils formula)', () => {
  // Import the pure function
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { computeSafeToSpend } = require('@budget/shared-utils');

  it('returns correct projections with no obligations', () => {
    const result = computeSafeToSpend({
      walletBalance: 1000,
      expectedIncome: 0,
      upcomingSubscriptions: 0,
      upcomingRecurring: 0,
      goalContributions: 0,
      buffer: 0,
      daysRemaining: 10,
    });
    expect(result.projectedObligations).toBe(0);
    expect(result.projectedAvailable).toBe(1000);
    expect(result.safeToSpendToday).toBe(100); // 1000 / 10
  });

  it('clamps safeToSpendToday to 0 when projectedAvailable is negative', () => {
    const result = computeSafeToSpend({
      walletBalance: 100,
      expectedIncome: 0,
      upcomingSubscriptions: 500,
      upcomingRecurring: 0,
      goalContributions: 0,
      buffer: 0,
      daysRemaining: 5,
    });
    expect(result.projectedAvailable).toBe(-400);
    expect(result.safeToSpendToday).toBe(0); // max(0, ...)
  });

  it('applies buffer correctly', () => {
    const result = computeSafeToSpend({
      walletBalance: 1100,
      expectedIncome: 0,
      upcomingSubscriptions: 100,
      upcomingRecurring: 0,
      goalContributions: 0,
      buffer: 200,
      daysRemaining: 10,
    });
    // projectedAvailable = 1100 - 100 = 1000; safeToSpendToday = (1000 - 200) / 10 = 80
    expect(result.projectedAvailable).toBe(1000);
    expect(result.safeToSpendToday).toBe(80);
  });

  it('uses max(1, daysRemaining) to avoid division by zero', () => {
    const result = computeSafeToSpend({
      walletBalance: 500,
      expectedIncome: 0,
      upcomingSubscriptions: 0,
      upcomingRecurring: 0,
      goalContributions: 0,
      buffer: 0,
      daysRemaining: 0,
    });
    expect(result.safeToSpendToday).toBe(500); // daysRemaining clamped to 1
  });
});

// ---------------------------------------------------------------------------
// SafeToSpendService.compute integration-style tests (no I/O, mocked)
// ---------------------------------------------------------------------------
describe('SafeToSpendService.compute', () => {
  it('returns safeToSpendToday=0 when there is no income and wallet is empty', async () => {
    const service = makeService({ walletBalances: [], rates: null });
    const result = await service.compute('acc-1', 'user-1', 'PLN');
    expect(result.safeToSpendToday).toBe(0);
    expect(result.baseCurrency).toBe('PLN');
    expect(result.incomeInferred).toBe(false);
    expect(result.breakdown.walletBalance).toBe(0);
  });

  it('no-income case: horizon = end of month, incomeInferred = false', async () => {
    const today = new Date();
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const service = makeService({
      walletBalances: [{ currencyCode: 'PLN', currentBalance: 1000 }],
      rates: null,
    });
    const result = await service.compute('acc-1', 'user-1', 'PLN');
    expect(result.incomeInferred).toBe(false);
    expect(result.breakdown.expectedIncome).toBe(0);
    expect(result.horizonDate).toBe(
      `${endOfMonth.getFullYear()}-${String(endOfMonth.getMonth() + 1).padStart(2, '0')}-${String(endOfMonth.getDate()).padStart(2, '0')}`,
    );
    expect(result.safeToSpendToday).toBeGreaterThan(0);
  });

  it('multi-currency: wallet with two currencies when rates are available', async () => {
    const service = makeService({
      walletBalances: [
        { currencyCode: 'PLN', currentBalance: 1000 },
        { currencyCode: 'USD', currentBalance: 100 },
      ],
      rates: { PLN: 4.0, USD: 1.0, EUR: 0.9 }, // 1 USD = 4 PLN => 100 USD = 25 USD in USD, but base is USD
      // Actually: base=USD, rates[PLN]=4.0 means 1 USD = 4 PLN => 1 PLN = 1/4 USD = 0.25 USD
    });
    const result = await service.compute('acc-1', 'user-1', 'USD');
    // USD wallet: 100 USD stays as 100 USD
    // PLN wallet: 1000 PLN * (1/4) = 250 USD
    expect(result.breakdown.walletBalance).toBeCloseTo(350, 0);
    expect(result.fxApproximate).toBe(true);
  });

  it('negative projectedAvailable clamps safeToSpendToday to 0', async () => {
    // Wallet has 100 USD, subscriptions cost 500 USD this month
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 3); // subscription due in 3 days, within month

    const service = makeService({
      walletBalances: [{ currencyCode: 'USD', currentBalance: 100 }],
      subscriptions: [
        {
          amount: 500,
          currencyCode: 'USD',
          billingCycle: 'monthly',
          nextRenewalDate: nextWeek,
          isActive: true,
        },
      ],
      rates: null,
    });
    const result = await service.compute('acc-1', 'user-1', 'USD');
    expect(result.safeToSpendToday).toBe(0);
    expect(result.projectedAvailable).toBeLessThan(0);
  });

  it('safeToSpendCacheKey returns correct key format', () => {
    expect(safeToSpendCacheKey('acc-123', 'EUR')).toBe('sts:acc-123:EUR');
  });
});

// ---------------------------------------------------------------------------
// SafeToSpendService.checkAffordability tests
// ---------------------------------------------------------------------------
describe('SafeToSpendService.checkAffordability', () => {
  it('returns within_safe when amount <= safeToSpendToday', async () => {
    const service = makeService({
      walletBalances: [{ currencyCode: 'USD', currentBalance: 2000 }],
      rates: null,
    });
    // With 2000 USD and ~20 days left, safeToSpendToday ~ 100 USD/day
    const verdict = await service.checkAffordability('acc-1', 'user-1', 'USD', 10, 'USD');
    expect(verdict.affordable).toBe(true);
    expect(verdict.reasonCode).toBe('within_safe');
    expect(verdict.amountInBase).toBe(10);
    expect(verdict.baseCurrency).toBe('USD');
  });

  it('returns over_available when amount > projectedAvailable', async () => {
    const service = makeService({
      walletBalances: [{ currencyCode: 'USD', currentBalance: 50 }],
      rates: null,
    });
    const verdict = await service.checkAffordability('acc-1', 'user-1', 'USD', 999, 'USD');
    expect(verdict.affordable).toBe(false);
    expect(verdict.reasonCode).toBe('over_available');
  });
});
