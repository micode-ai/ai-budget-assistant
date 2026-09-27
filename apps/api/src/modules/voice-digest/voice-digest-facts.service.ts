import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { SafeToSpendService } from '../insights/safe-to-spend.service';
import { InflationShieldService } from '../insights/inflation-shield.service';
import { ShoppingListService } from '../shopping-list/shopping-list.service';
import { RealSalaryService } from '../insights/real-salary/real-salary.service';
import { convertAmount, getRatesSafe } from '../../common/utils/fx';
import { attributeToCategories, type AttributableExpense } from '../../common/utils/category-attribution';
import { EXCLUDE_SPLIT_RECEIVABLE } from '../../common/utils/expense-filters';
import type { DigestInputs } from './digest-facts.util';

/**
 * IO layer for the voice digest: gathers the raw inputs consumed by the pure
 * `assembleDigestFacts` (digest-facts.util.ts) from the five existing insight
 * services plus one direct spend query. Every external call is wrapped so a
 * single failing dependency degrades that one fact to null/empty rather than
 * failing the whole digest — a user with a broken inflation-shield cache
 * should still hear their weekly total.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 7;
const WINDOW_COUNT = 9; // window 0 (most recent) .. window 8 (oldest)
const PRIOR_WINDOW_COUNT = WINDOW_COUNT - 1;

type ExpenseRow = AttributableExpense & { date: Date; currencyCode: string };

/**
 * window 0 = [now-7d, now); window k = [now-7(k+1)d, now-7k*d).
 * Returns null when `date` falls outside all 9 windows (older than 63 days,
 * or not before `now`).
 */
function windowIndexFor(date: Date, now: Date): number | null {
  const t = date.getTime();
  const nowMs = now.getTime();
  for (let k = 0; k < WINDOW_COUNT; k += 1) {
    const lower = nowMs - WINDOW_DAYS * (k + 1) * DAY_MS;
    const upper = nowMs - WINDOW_DAYS * k * DAY_MS;
    if (t >= lower && t < upper) return k;
  }
  return null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface SpendFacts {
  weekTotal: number;
  priorWeekTotals: number[];
  categoryWeek: { name: string; total: number }[];
  categoryUsual: { name: string; total: number }[];
}

@Injectable()
export class VoiceDigestFactsService {
  private readonly logger = new Logger(VoiceDigestFactsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly safeToSpend: SafeToSpendService,
    private readonly inflationShield: InflationShieldService,
    private readonly shoppingList: ShoppingListService,
    private readonly realSalary: RealSalaryService,
  ) {}

  async gather(accountId: string, userId: string, baseCurrency: string, now: Date): Promise<DigestInputs> {
    const rates = await getRatesSafe(this.exchangeRateService, baseCurrency);
    const convert = (amount: number, from: string): number | null => convertAmount(amount, from, baseCurrency, rates);

    const spend = await this.loadSpend(accountId, baseCurrency, now, convert);
    const { safeToSpendToday, daysToIncome } = await this.loadSafeToSpend(accountId, userId, baseCurrency);
    const shieldItem = await this.loadShieldItem(accountId, userId, baseCurrency);
    const restockNames = await this.loadRestockNames(accountId);
    const realChangePct = await this.loadRealChangePct(accountId, userId, baseCurrency);

    return {
      currency: baseCurrency,
      weekTotal: spend.weekTotal,
      priorWeekTotals: spend.priorWeekTotals,
      categoryWeek: spend.categoryWeek,
      categoryUsual: spend.categoryUsual,
      safeToSpendToday,
      daysToIncome,
      shieldItem,
      restockNames,
      realChangePct,
    };
  }

  private async loadSpend(
    accountId: string,
    baseCurrency: string,
    now: Date,
    convert: (amount: number, from: string) => number | null,
  ): Promise<SpendFacts> {
    const empty: SpendFacts = {
      weekTotal: 0,
      priorWeekTotals: new Array(PRIOR_WINDOW_COUNT).fill(0),
      categoryWeek: [],
      categoryUsual: [],
    };

    let rows: ExpenseRow[];
    try {
      rows = (await this.prisma.expense.findMany({
        where: {
          accountId,
          isDeleted: false,
          isPlanned: false,
          ...EXCLUDE_SPLIT_RECEIVABLE,
          date: { gte: new Date(now.getTime() - WINDOW_COUNT * WINDOW_DAYS * DAY_MS) },
        },
        select: {
          amount: true,
          currencyCode: true,
          date: true,
          categoryId: true,
          category: { select: { id: true, name: true } },
          categorySplits: {
            where: { isDeleted: false },
            select: { categoryId: true, amount: true, category: { select: { id: true, name: true } } },
          },
        },
      })) as unknown as ExpenseRow[];
    } catch (err) {
      this.logger.warn(`VoiceDigestFactsService.loadSpend failed: ${errorMessage(err)}`);
      return empty;
    }

    const windowTotals = new Array<number>(WINDOW_COUNT).fill(0);
    const windowCategoryTotals: Map<string, number>[] = Array.from({ length: WINDOW_COUNT }, () => new Map());

    for (const row of rows) {
      const idx = windowIndexFor(new Date(row.date), now);
      if (idx === null) continue;

      for (const part of attributeToCategories(row)) {
        const converted = convert(part.amount, row.currencyCode);
        if (converted === null) continue; // unknown rate → skip this attributed part

        windowTotals[idx] += converted;
        if (part.categoryName && part.categoryName !== 'Uncategorized') {
          const map = windowCategoryTotals[idx];
          map.set(part.categoryName, (map.get(part.categoryName) ?? 0) + converted);
        }
      }
    }

    const [weekWindow, ...priorWindows] = windowCategoryTotals;
    const categoryWeek = Array.from(weekWindow.entries()).map(([name, total]) => ({ name, total }));

    const usualSums = new Map<string, number>();
    for (const map of priorWindows) {
      for (const [name, total] of map.entries()) {
        usualSums.set(name, (usualSums.get(name) ?? 0) + total);
      }
    }
    const categoryUsual = Array.from(usualSums.entries()).map(([name, sum]) => ({
      name,
      total: sum / PRIOR_WINDOW_COUNT,
    }));

    return {
      weekTotal: windowTotals[0],
      priorWeekTotals: windowTotals.slice(1), // windows 1..8, already newest-first
      categoryWeek,
      categoryUsual,
    };
  }

  private async loadSafeToSpend(
    accountId: string,
    userId: string,
    baseCurrency: string,
  ): Promise<{ safeToSpendToday: number | null; daysToIncome: number | null }> {
    try {
      const sts = await this.safeToSpend.compute(accountId, userId, baseCurrency);
      return {
        safeToSpendToday: sts.safeToSpendToday,
        daysToIncome: sts.incomeInferred ? sts.daysRemaining : null,
      };
    } catch (err) {
      this.logger.warn(`VoiceDigestFactsService.loadSafeToSpend failed: ${errorMessage(err)}`);
      return { safeToSpendToday: null, daysToIncome: null };
    }
  }

  private async loadShieldItem(
    accountId: string,
    userId: string,
    baseCurrency: string,
  ): Promise<{ name: string; monthlyChangePct: number } | null> {
    try {
      const shield = await this.inflationShield.getShield(accountId, userId, baseCurrency);
      let best: { canonicalName: string; monthlyChangePct: number } | null = null;
      for (const item of shield.items) {
        if (item.monthlyChangePct <= 0) continue;
        if (!best || item.monthlyChangePct > best.monthlyChangePct) best = item;
      }
      return best ? { name: best.canonicalName, monthlyChangePct: best.monthlyChangePct } : null;
    } catch (err) {
      this.logger.warn(`VoiceDigestFactsService.loadShieldItem failed: ${errorMessage(err)}`);
      return null;
    }
  }

  private async loadRestockNames(accountId: string): Promise<string[]> {
    try {
      const restock = await this.shoppingList.getRestockSuggestions(accountId);
      return restock.map((r) => r.canonicalName);
    } catch (err) {
      this.logger.warn(`VoiceDigestFactsService.loadRestockNames failed: ${errorMessage(err)}`);
      return [];
    }
  }

  private async loadRealChangePct(accountId: string, userId: string, baseCurrency: string): Promise<number | null> {
    try {
      const rs = await this.realSalary.compute(accountId, userId, baseCurrency);
      return rs.status === 'ready' ? rs.realChangePct : null;
    } catch (err) {
      this.logger.warn(`VoiceDigestFactsService.loadRealChangePct failed: ${errorMessage(err)}`);
      return null;
    }
  }
}
