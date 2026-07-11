import { WrappedService, wrappedCacheKey } from './wrapped.service';
import type { WrappedResponse } from '@budget/shared-types';

// Lightweight stubs — mirrors safe-to-spend.service.spec.ts (no NestJS TestingModule).
// This exercises the SERVICE IO path (Prisma select → row mapping, cache flow,
// encryption gate, inflation/streak wiring) that the pure wrapped.util.spec can't.

const YEAR = new Date().getFullYear();

interface Stubs {
  encryptionTier?: number;
  expenses?: any[];
  incomes?: any[];
  rates?: Record<string, number> | null;
  inflationIndex?: number | null;
  streak?: { longestStreak: number; currentStreak: number } | null;
  cached?: WrappedResponse | null;
}

function makeService(s: Stubs = {}) {
  const {
    encryptionTier = 0,
    expenses = [],
    incomes = [],
    rates = null,
    inflationIndex = 4.2,
    streak = { longestStreak: 30, currentStreak: 12 },
    cached = null,
  } = s;

  const cacheSet = jest.fn().mockResolvedValue(undefined);
  const prisma: any = {
    account: { findUnique: jest.fn().mockResolvedValue({ encryptionTier }) },
    expense: { findMany: jest.fn().mockResolvedValue(expenses) },
    income: { findMany: jest.fn().mockResolvedValue(incomes) },
  };
  const exchangeRateService: any = {
    getRates: jest.fn().mockResolvedValue({ rates: rates ?? {} }),
  };
  const cacheService: any = {
    get: jest.fn().mockResolvedValue(cached),
    set: cacheSet,
  };
  const priceHistoryService: any = {
    getPriceHistory: jest.fn().mockResolvedValue({ inflationIndex }),
  };
  const streakService: any = {
    getStreak: jest.fn().mockResolvedValue(streak),
  };

  const service = new WrappedService(prisma, exchangeRateService, cacheService, priceHistoryService, streakService);
  return { service, prisma, cacheService, cacheSet };
}

function exp(over: any = {}) {
  return {
    amount: '10',
    currencyCode: 'USD',
    date: new Date(YEAR, 6, 15), // July of the target year
    merchant: null,
    source: 'manual',
    categoryId: null,
    category: null,
    ...over,
  };
}

describe('WrappedService.getWrapped', () => {
  it('returns a cached response without touching Prisma', async () => {
    const cached: WrappedResponse = {
      year: YEAR,
      baseCurrency: 'USD',
      generatedAt: '2027-01-01T00:00:00.000Z',
      hasEnoughData: true,
      fxApproximate: false,
      cards: [{ type: 'intro', year: YEAR, baseCurrency: 'USD' }],
    };
    const { service, prisma } = makeService({ cached });
    const res = await service.getWrapped('acc', 'user', 'USD', YEAR);
    expect(res).toBe(cached);
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });

  it('assembles cards from Prisma rows and writes the cache', async () => {
    const expenses = [
      exp({ amount: '50', merchant: 'Biedronka', source: 'ocr', categoryId: 'c1', category: { name: 'Groceries', color: '#0f0' } }),
      exp({ amount: '30', merchant: 'Biedronka', categoryId: 'c1', category: { name: 'Groceries', color: '#0f0' } }),
      exp({ amount: '20', merchant: 'Biedronka', categoryId: 'c1', category: { name: 'Groceries', color: '#0f0' } }),
      exp({ amount: '40', merchant: 'Shell', categoryId: 'c2', category: { name: 'Transport', color: '#00f' } }),
    ];
    const incomes = [{ amount: '1000', currencyCode: 'USD', date: new Date(YEAR, 6, 1) }];
    const { service, cacheSet } = makeService({ expenses, incomes });

    const res = await service.getWrapped('acc', 'user', 'USD', YEAR);

    expect(res.hasEnoughData).toBe(true);
    expect(res.cards[0].type).toBe('intro');
    expect(res.cards[res.cards.length - 1].type).toBe('outro');
    const merchant = res.cards.find((c) => c.type === 'top_merchant') as any;
    expect(merchant?.name).toBe('Biedronka');
    const inflation = res.cards.find((c) => c.type === 'personal_inflation') as any;
    expect(inflation?.indexPct).toBe(4.2); // wired from PriceHistoryService for the current year
    const streak = res.cards.find((c) => c.type === 'streak') as any;
    expect(streak?.longestStreak).toBe(30); // wired from StreakService
    // cache written under the canonical key
    expect(cacheSet).toHaveBeenCalledWith(wrappedCacheKey('acc', 'USD', YEAR), res, expect.any(Number));
  });

  it('returns empty (hasEnoughData=false) for a tier-2 fully-encrypted account', async () => {
    const { service, prisma } = makeService({ encryptionTier: 2 });
    const res = await service.getWrapped('acc', 'user', 'USD', YEAR);
    expect(res.hasEnoughData).toBe(false);
    expect(res.cards).toEqual([]);
    expect(prisma.expense.findMany).not.toHaveBeenCalled(); // short-circuits before querying rows
  });

  it('returns empty below the tracked-rows threshold', async () => {
    const { service } = makeService({ expenses: [exp(), exp()], incomes: [] });
    const res = await service.getWrapped('acc', 'user', 'USD', YEAR);
    expect(res.hasEnoughData).toBe(false);
    expect(res.cards).toEqual([]);
  });
});
