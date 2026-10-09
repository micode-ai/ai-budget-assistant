import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { CacheService } from '../../common/cache/cache.service';
import { PriceHistoryService } from '../price-history/price-history.service';
import { StreakService } from '../gamification/streak.service';
import { getRatesSafe } from '../../common/utils/fx';
import { EXCLUDE_SPLIT_RECEIVABLE } from '../../common/utils/expense-filters';
import type { WrappedResponse } from '@budget/shared-types';
import {
  assembleWrapped,
  WrappedExpenseRow,
  WrappedIncomeRow,
} from './wrapped.util';
import {
  assembleMonthlyWrapped,
  MonthlyWrappedExpenseRow,
  MonthlyWrappedIncomeRow,
} from './wrapped-monthly.util';

// Wrapped is a stable, year-scoped artifact — cache for an hour.
const CACHE_TTL_SEC = 3600;

/**
 * Redis cache key for a Wrapped result.
 * Per-user base currency is folded in (same reasoning as safeToSpendCacheKey).
 */
export function wrappedCacheKey(accountId: string, baseCurrency: string, year: number, month?: number): string {
  const period = month ? `${year}-${String(month).padStart(2, '0')}` : String(year);
  return `wrapped:${accountId}:${baseCurrency}:${period}`;
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

  /** Monthly deck (ABA-641): `month` is 1-12. Same cache, same exclusions as the yearly deck. */
  async getMonthlyWrapped(
    accountId: string,
    userId: string,
    baseCurrency: string,
    year: number,
    month: number,
  ): Promise<WrappedResponse> {
    const key = wrappedCacheKey(accountId, baseCurrency, year, month);
    const cached = await this.cacheService.get<WrappedResponse>(key);
    if (cached) return cached;

    const result = await this.computeMonthly(accountId, userId, baseCurrency, year, month);
    await this.cacheService.set(key, result, CACHE_TTL_SEC);
    return result;
  }

  private async computeMonthly(
    accountId: string,
    userId: string,
    baseCurrency: string,
    year: number,
    month: number,
  ): Promise<WrappedResponse> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { encryptionTier: true },
    });
    if ((account?.encryptionTier ?? 0) >= 2) {
      return { ...this.emptyResponse(year, baseCurrency), month };
    }

    // This month + the previous one in one query, for the vs-last-month card.
    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const rangeStart = new Date(year, month - 2, 1, 0, 0, 0, 0);
    const rangeEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const [expenses, incomes, rates] = await Promise.all([
      this.prisma.expense.findMany({
        // Same spend definition as the yearly deck (see compute()).
        where: {
          accountId,
          isDeleted: false,
          isPlanned: false,
          ...EXCLUDE_SPLIT_RECEIVABLE,
          date: { gte: rangeStart, lte: rangeEnd },
        },
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
        where: { accountId, isDeleted: false, ...EXCLUDE_SPLIT_RECEIVABLE, date: { gte: rangeStart, lte: rangeEnd } },
        select: { amount: true, currencyCode: true, date: true },
      }),
      getRatesSafe(this.exchangeRateService, baseCurrency),
    ]);

    const expenseRows: MonthlyWrappedExpenseRow[] = expenses.map((e) => ({
      amount: Number(e.amount),
      currencyCode: e.currencyCode || baseCurrency,
      inMonth: e.date >= monthStart,
      date: localDateKey(e.date),
      weekday: e.date.getDay(),
      merchant: e.merchant ?? null,
      source: e.source,
      categoryId: e.categoryId ?? null,
      categoryName: e.category?.name ?? null,
      categoryColor: e.category?.color ?? null,
    }));
    const incomeRows: MonthlyWrappedIncomeRow[] = incomes.map((i) => ({
      amount: Number(i.amount),
      currencyCode: i.currencyCode || baseCurrency,
      inMonth: i.date >= monthStart,
    }));

    let streakLongest = 0;
    let streakCurrent = 0;
    try {
      const streak = await this.streakService.getStreak(accountId, userId);
      streakLongest = streak?.longestStreak ?? 0;
      streakCurrent = streak?.currentStreak ?? 0;
    } catch (err) {
      this.logger.warn(`Monthly wrapped streak lookup failed for ${accountId}: ${err}`);
    }

    return assembleMonthlyWrapped({
      year,
      month,
      baseCurrency,
      generatedAt: new Date().toISOString(),
      expenses: expenseRows,
      incomes: incomeRows,
      rates,
      streakLongest,
      streakCurrent,
    });
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
        // Same exclusions as budgets/analytics: a planned expense has not
        // happened, and a split receivable is money that already left as the
        // receipt. NOT isDebt — a standalone lent-money row is a real outflow.
        where: {
          accountId,
          isDeleted: false,
          isPlanned: false,
          ...EXCLUDE_SPLIT_RECEIVABLE,
          date: { gte: rangeStart, lte: rangeEnd },
        },
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
        where: { accountId, isDeleted: false, ...EXCLUDE_SPLIT_RECEIVABLE, date: { gte: rangeStart, lte: rangeEnd } },
        select: { amount: true, currencyCode: true, date: true },
      }),
      getRatesSafe(this.exchangeRateService, baseCurrency),
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
