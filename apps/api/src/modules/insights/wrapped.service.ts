import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { CacheService } from '../../common/cache/cache.service';
import { PriceHistoryService } from '../price-history/price-history.service';
import { StreakService } from '../gamification/streak.service';
import type { WrappedResponse } from '@budget/shared-types';
import {
  assembleWrapped,
  WrappedExpenseRow,
  WrappedIncomeRow,
} from './wrapped.util';

// Wrapped is a stable, year-scoped artifact — cache for an hour.
const CACHE_TTL_SEC = 3600;

/**
 * Redis cache key for a Wrapped result.
 * Per-user base currency is folded in (same reasoning as safeToSpendCacheKey).
 */
export function wrappedCacheKey(accountId: string, baseCurrency: string, year: number): string {
  return `wrapped:${accountId}:${baseCurrency}:${year}`;
}

@Injectable()
export class WrappedService {
  private readonly logger = new Logger(WrappedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly cacheService: CacheService,
    private readonly priceHistoryService: PriceHistoryService,
    private readonly streakService: StreakService,
  ) {}

  /** Fetch rates for `base`; null when unavailable (caller falls back to native amounts). */
  private async getRatesSafe(base: string): Promise<Record<string, number> | null> {
    try {
      const { rates } = await this.exchangeRateService.getRates(base);
      return rates || null;
    } catch {
      return null;
    }
  }

  async getWrapped(
    accountId: string,
    userId: string,
    baseCurrency: string,
    year: number,
  ): Promise<WrappedResponse> {
    const key = wrappedCacheKey(accountId, baseCurrency, year);
    const cached = await this.cacheService.get<WrappedResponse>(key);
    if (cached) return cached;

    const result = await this.compute(accountId, userId, baseCurrency, year);
    await this.cacheService.set(key, result, CACHE_TTL_SEC);
    return result;
  }

  private emptyResponse(year: number, baseCurrency: string): WrappedResponse {
    return {
      year,
      baseCurrency,
      generatedAt: new Date().toISOString(),
      hasEnoughData: false,
      fxApproximate: false,
      cards: [],
    };
  }

  private async compute(
    accountId: string,
    userId: string,
    baseCurrency: string,
    year: number,
  ): Promise<WrappedResponse> {
    // Full end-to-end encryption hides amounts server-side → nothing to aggregate.
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { encryptionTier: true },
    });
    if ((account?.encryptionTier ?? 0) >= 2) {
      return this.emptyResponse(year, baseCurrency);
    }

    // Pull this year + prior year in one shot so savedVsLastYear needs no extra query.
    const rangeStart = new Date(year - 1, 0, 1, 0, 0, 0, 0);
    const rangeEnd = new Date(year, 11, 31, 23, 59, 59, 999);

    const [expenses, incomes, rates] = await Promise.all([
      this.prisma.expense.findMany({
        where: { accountId, isDeleted: false, date: { gte: rangeStart, lte: rangeEnd } },
        select: {
          amount: true,
          currencyCode: true,
          date: true,
          merchant: true,
          source: true,
          categoryId: true,
          category: { select: { name: true, color: true } },
        },
      }),
      this.prisma.income.findMany({
        where: { accountId, isDeleted: false, date: { gte: rangeStart, lte: rangeEnd } },
        select: { amount: true, currencyCode: true, date: true },
      }),
      this.getRatesSafe(baseCurrency),
    ]);

    const expenseRows: WrappedExpenseRow[] = expenses.map((e) => ({
      amount: Number(e.amount),
      currencyCode: e.currencyCode || baseCurrency,
      year: e.date.getFullYear(),
      month: e.date.getMonth(),
      merchant: e.merchant ?? null,
      source: e.source,
      categoryId: e.categoryId ?? null,
      categoryName: e.category?.name ?? null,
      categoryColor: e.category?.color ?? null,
    }));
    const incomeRows: WrappedIncomeRow[] = incomes.map((i) => ({
      amount: Number(i.amount),
      currencyCode: i.currencyCode || baseCurrency,
      year: i.date.getFullYear(),
    }));

    // Personal inflation: rolling-12-month proxy, only meaningful for the current
    // or just-ended year (the price-history window is relative to now).
    let inflationPct: number | null = null;
    const currentYear = new Date().getFullYear();
    if (year === currentYear || year === currentYear - 1) {
      try {
        const ph = await this.priceHistoryService.getPriceHistory(accountId, '12m');
        inflationPct = ph.inflationIndex ?? null;
      } catch (err) {
        this.logger.warn(`Wrapped inflation lookup failed for ${accountId}: ${err}`);
      }
    }

    let streakLongest = 0;
    let streakCurrent = 0;
    try {
      const streak = await this.streakService.getStreak(accountId, userId);
      streakLongest = streak?.longestStreak ?? 0;
      streakCurrent = streak?.currentStreak ?? 0;
    } catch (err) {
      this.logger.warn(`Wrapped streak lookup failed for ${accountId}: ${err}`);
    }

    return assembleWrapped({
      year,
      baseCurrency,
      generatedAt: new Date().toISOString(),
      expenses: expenseRows,
      incomes: incomeRows,
      rates,
      inflationPct,
      streakLongest,
      streakCurrent,
    });
  }
}
