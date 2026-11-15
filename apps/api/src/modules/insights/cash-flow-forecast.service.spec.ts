import { CashFlowForecastService, cashFlowForecastCacheKey } from './cash-flow-forecast.service';
import {
  buildForecastSeries,
  detectMonthlyIncomeSeries,
  incomeOccurrences,
  paysSubscription,
  recurringOccurrences,
  subscriptionOccurrences,
} from './cash-flow-forecast.util';

// Fixed clock: 10 June 2026, midday.
const NOW = new Date(2026, 5, 10, 12, 0, 0);
const TODAY = new Date(2026, 5, 10);
const d = (m: number, day: number) => new Date(2026, m - 1, day);

function makeService(o: {
  encryptionTier?: number;
  balances?: Array<{ currencyCode: string; currentBalance: number }>;
  incomes?: unknown[];
  subs?: unknown[];
  recurring?: unknown[];
  spend?: unknown[];
  rates?: Record<string, number>;
}) {
  const expenseFindMany = jest
    .fn()
    .mockResolvedValueOnce(o.recurring ?? []) // recurring templates
    .mockResolvedValueOnce(o.spend ?? []); // recent spend
  const prisma: any = {
    account: { findUnique: jest.fn().mockResolvedValue({ encryptionTier: o.encryptionTier ?? 0 }) },
    income: { findMany: jest.fn().mockResolvedValue(o.incomes ?? []) },
    userSubscription: { findMany: jest.fn().mockResolvedValue(o.subs ?? []) },
    expense: { findMany: expenseFindMany },
  };
  const wallet: any = { getSummary: jest.fn().mockResolvedValue({ balances: o.balances ?? [] }) };
  const fx: any = { getRates: jest.fn().mockResolvedValue({ rates: o.rates ?? { PLN: 1, EUR: 0.25 } }) };
  const cache: any = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
  return { service: new CashFlowForecastService(prisma, wallet, fx, cache), prisma, cache };
}

describe('cash-flow-forecast.util', () => {
  it('walks an overdue subscription forward and counts a renewal due today', () => {
    expect(subscriptionOccurrences(d(5, 10), 'monthly', TODAY, d(7, 10))).toEqual([d(6, 10), d(7, 10)]);
  });

  it('places recurring expenses strictly after today', () => {
    expect(recurringOccurrences(d(5, 10), 'monthly', TODAY, d(7, 10))).toEqual([d(7, 10)]);
    expect(recurringOccurrences(d(6, 3), 'weekly', TODAY, d(6, 24))).toEqual([d(6, 17), d(6, 24)]);
  });

  it('detects a monthly income and predicts its next date', () => {
    const series = detectMonthlyIncomeSeries([
      { amount: '5000', currencyCode: 'PLN', description: 'Salary', date: d(4, 25) },
      { amount: '5004', currencyCode: 'PLN', description: 'salary ', date: d(5, 25) },
    ]);
    expect(series).toHaveLength(1);
    const dates = incomeOccurrences(series[0], TODAY, d(7, 10));
    expect(dates.map((x) => x.getDate())).toEqual([24]); // 25 May + the 30-day average gap
  });

  it('builds the balance: scheduled events every day, typical spend from tomorrow', () => {
    const s = buildForecastSeries(TODAY, 3, 100, [{ date: d(6, 12), kind: 'subscription', label: 'x', amount: -50 }], 10);
    expect(s.days.map((x) => x.balance)).toEqual([100, 90, 30, 20]);
    expect(s.lowest).toEqual({ date: '2026-06-13', balance: 20 });
    expect(s.endBalance).toBe(20);
  });

  it('recognises a subscription charge by name or by category and amount', () => {
    const subs = [{ name: 'Streaming', amount: '50', currencyCode: 'PLN', categoryId: 'c1' }];
    expect(paysSubscription({ amount: '1', currencyCode: 'PLN', date: TODAY, merchant: 'STREAMING' }, subs)).toBe(true);
    expect(paysSubscription({ amount: '50.3', currencyCode: 'PLN', date: TODAY, categoryId: 'c1' }, subs)).toBe(true);
    expect(paysSubscription({ amount: '60', currencyCode: 'PLN', date: TODAY, categoryId: 'c1' }, subs)).toBe(false);
  });
});

describe('CashFlowForecastService', () => {
  it('returns no figures for a fully encrypted account', async () => {
    const { service, prisma } = makeService({ encryptionTier: 2 });
    const res = await service.compute('a1', 'PLN', NOW);
    expect(res.encryptionRestricted).toBe(true);
    expect(prisma.income.findMany).not.toHaveBeenCalled();
  });

  it('combines balance, income, subscriptions, recurring and typical spending', async () => {
    // 30 days of history at 20/day of everyday spending, plus a subscription
    // charge and a recurring rent inside it that must NOT count as everyday.
    const spend = Array.from({ length: 30 }, (_, i) => ({
      amount: '20', currencyCode: 'PLN', date: new Date(2026, 4, 11 + i), description: 'shop', categoryId: null, recurringId: null,
    }));
    spend.push({ amount: '50', currencyCode: 'PLN', date: d(5, 15), description: 'Streaming', categoryId: null, recurringId: null });
    spend.push({ amount: '1500', currencyCode: 'PLN', date: d(5, 20), description: 'Rent', categoryId: null, recurringId: 'r1' } as any);

    const { service } = makeService({
      balances: [{ currencyCode: 'PLN', currentBalance: 2000 }, { currencyCode: 'EUR', currentBalance: 100 }],
      incomes: [
        { amount: '5000', currencyCode: 'PLN', description: 'Salary', date: d(4, 25) },
        { amount: '5000', currencyCode: 'PLN', description: 'Salary', date: d(5, 25) },
      ],
      subs: [{ name: 'Streaming', amount: '50', currencyCode: 'PLN', billingCycle: 'monthly', nextRenewalDate: d(6, 15), categoryId: null }],
      recurring: [{ recurringId: 'r1', recurringPeriod: 'monthly', date: d(5, 20), amount: '1500', currencyCode: 'PLN', description: 'Rent' }],
      spend,
    });

    const res = await service.compute('a1', 'PLN', NOW);
    expect(res.startBalance).toBe(2400); // 2000 PLN + 100 EUR at 0.25
    expect(res.fxApproximate).toBe(true);
    expect(res.typicalDailySpend).toBe(20); // 600 over 30 days; streaming and rent excluded
    expect(res.spendingHistoryShort).toBe(false);
    expect(res.days).toHaveLength(31);
    expect(res.events.map((e) => [e.date, e.kind, e.amount])).toEqual([
      ['2026-06-15', 'subscription', -50],
      ['2026-06-20', 'recurring', -1500],
      ['2026-06-24', 'income', 5000], // 25 May + avg gap of 30 days
    ]);
    // Lowest point: the day before salary, after rent and 13 days of spending.
    expect(res.lowest).toEqual({ date: '2026-06-23', balance: 2400 - 50 - 1500 - 13 * 20 });
    expect(res.endBalance).toBe(2400 - 50 - 1500 + 5000 - 30 * 20);
  });

  it('does not estimate everyday spending from less than 14 days of history', async () => {
    const { service } = makeService({
      balances: [{ currencyCode: 'PLN', currentBalance: 100 }],
      spend: [{ amount: '500', currencyCode: 'PLN', date: d(6, 5), description: 'x', categoryId: null, recurringId: null }],
    });
    const res = await service.compute('a1', 'PLN', NOW);
    expect(res.spendingHistoryShort).toBe(true);
    expect(res.typicalDailySpend).toBe(0);
    expect(res.endBalance).toBe(100);
  });

  it('caches per account and currency', async () => {
    const { service, cache } = makeService({});
    await service.getForecast('a1', 'PLN');
    expect(cache.set).toHaveBeenCalledWith(cashFlowForecastCacheKey('a1', 'PLN'), expect.any(Object), 300);
  });
});
