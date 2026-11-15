import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { EXCLUDE_SPLIT_RECEIVABLE } from '../../common/utils/expense-filters';
import { attributeToCategories } from '../../common/utils/category-attribution';
import { convertAmount, getRatesSafe } from '../../common/utils/fx';

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly budgetsService: BudgetsService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  /**
   * Check if the account has Tier 2 (full) encryption.
   */
  private async isFullEncryption(accountId: string): Promise<boolean> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { encryptionTier: true },
    });
    return (account?.encryptionTier ?? 0) >= 2;
  }

  async getInsights(accountId: string, baseCurrency = 'USD') {
    if (await this.isFullEncryption(accountId)) {
      return {
        encryptionRestricted: true,
        anomalies: [],
        predictions: [],
      };
    }

    const [anomalies, predictions] = await Promise.all([
      this.detectSpendingAnomalies(accountId, baseCurrency),
      this.getBudgetPredictions(accountId),
    ]);

    return { anomalies, predictions };
  }

  /**
   * Categories spending 30%+ above their usual level this month.
   *
   * "Usual" is the average of the previous three months over the SAME number
   * of days: on the 5th, the current month's first five days are compared with
   * the first five days of each earlier month — never a partial month against
   * whole ones, which flagged nothing early in the month and everything late.
   *
   * Spend follows the app's own definition: planned expenses and split
   * receivables are not spend, category splits decide attribution
   * (`attributeToCategories`), and every amount is converted to the caller's
   * `baseCurrency` — an amount with no known rate is left out, never summed
   * unconverted (docs/wiki/features/display-currency-conversion.md).
   */
  async detectSpendingAnomalies(accountId: string, baseCurrency = 'USD', now: Date = new Date()) {
    const TRAILING_MONTHS = 3;
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const elapsedDays = now.getDate();

    // Same-days window of each trailing month, end exclusive and clamped to the
    // month's own end (the 31st compares with all of February).
    const windows = Array.from({ length: TRAILING_MONTHS }, (_, idx) => {
      const i = idx + 1;
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const sameDays = new Date(start.getFullYear(), start.getMonth(), 1 + elapsedDays);
      return { start, end: sameDays < nextMonth ? sameDays : nextMonth };
    });

    const spendWhere = {
      accountId,
      isDeleted: false,
      isPlanned: false,
      ...EXCLUDE_SPLIT_RECEIVABLE,
    };
    const include = {
      category: true,
      categorySplits: { where: { isDeleted: false }, include: { category: true } },
    };

    const [currentExpenses, previousExpenses, rates] = await Promise.all([
      this.prisma.expense.findMany({
        where: { ...spendWhere, date: { gte: currentMonthStart, lte: endOfToday } },
        include,
      }),
      this.prisma.expense.findMany({
        where: { ...spendWhere, date: { gte: windows[TRAILING_MONTHS - 1].start, lt: currentMonthStart } },
        include,
      }),
      getRatesSafe(this.exchangeRateService, baseCurrency),
    ]);

    const addAttributed = (
      expense: (typeof currentExpenses)[number],
      onShare: (categoryId: string, categoryName: string, amount: number) => void,
    ) => {
      const currency = (expense as { currencyCode?: string }).currencyCode || baseCurrency;
      for (const share of attributeToCategories(expense)) {
        const converted = convertAmount(share.amount, currency, baseCurrency, rates);
        if (converted === null) continue;
        onShare(share.categoryId || 'uncategorized', share.categoryName, converted);
      }
    };

    const currentByCategory = new Map<string, { amount: number; name: string }>();
    for (const expense of currentExpenses) {
      addAttributed(expense, (categoryId, name, amount) => {
        const current = currentByCategory.get(categoryId) || { amount: 0, name };
        current.amount += amount;
        currentByCategory.set(categoryId, current);
      });
    }

    // Only the same-days slice of each trailing month counts. A month counts
    // towards the average when the ACCOUNT spent anything in that slice, so a
    // category the user skipped one month averages in a zero for it.
    const previousByCategory = new Map<string, number>();
    const monthsWithData = new Set<number>();
    for (const expense of previousExpenses) {
      const windowIdx = windows.findIndex((w) => expense.date >= w.start && expense.date < w.end);
      if (windowIdx === -1) continue;
      monthsWithData.add(windowIdx);
      addAttributed(expense, (categoryId, _name, amount) => {
        previousByCategory.set(categoryId, (previousByCategory.get(categoryId) || 0) + amount);
      });
    }

    const anomalies: Array<{
      categoryId: string;
      categoryName: string;
      currentAmount: number;
      averageAmount: number;
      percentageChange: number;
      period: string;
    }> = [];

    const monthCount = monthsWithData.size;
    if (monthCount === 0) return anomalies;

    for (const [categoryId, currentData] of currentByCategory) {
      const previousTotal = previousByCategory.get(categoryId);
      if (!previousTotal) continue;

      const averageAmount = Math.round((previousTotal / monthCount) * 100) / 100;
      if (averageAmount <= 0) continue;

      const percentageChange = ((currentData.amount - averageAmount) / averageAmount) * 100;

      if (percentageChange >= 30) {
        anomalies.push({
          categoryId,
          categoryName: currentData.name,
          currentAmount: Math.round(currentData.amount * 100) / 100,
          averageAmount,
          percentageChange: Math.round(percentageChange),
          period: `${currentMonthStart.getFullYear()}-${String(currentMonthStart.getMonth() + 1).padStart(2, '0')}`,
        });
      }
    }

    return anomalies.sort((a, b) => b.percentageChange - a.percentageChange);
  }

  async getBudgetPredictions(accountId: string) {
    const budgets = await this.prisma.budget.findMany({
      where: { accountId, isActive: true, isDeleted: false },
    });

    const predictions: Array<{
      budgetId: string;
      budgetName: string;
      estimatedExhaustionDate?: string;
      dailyBurnRate: number;
      daysRemaining: number;
      projectedTotal: number;
      currencyCode: string;
    }> = [];

    // Resolve once per account (not per budget) so every prediction in this
    // list agrees with what GET /budgets/:id/progress reports for an
    // anchored account — same reasoning as the AI chat tool dispatcher.
    const anchorDay = await this.budgetsService.getAccountAnchorDay(accountId);

    for (const budget of budgets) {
      try {
        const progress = await this.budgetsService.getProgress(accountId, budget.id, anchorDay);
        predictions.push({
          budgetId: budget.id,
          budgetName: budget.name,
          estimatedExhaustionDate: progress.estimatedExhaustionDate,
          dailyBurnRate: progress.dailyBurnRate,
          daysRemaining: progress.daysRemaining,
          projectedTotal: progress.projectedTotal,
          currencyCode: budget.currencyCode,
        });
      } catch (error) {
        this.logger.warn(`Failed to get progress for budget ${budget.id}: ${error}`);
      }
    }

    return predictions;
  }
}
