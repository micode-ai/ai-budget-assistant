import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly budgetsService: BudgetsService,
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

  async getInsights(accountId: string) {
    if (await this.isFullEncryption(accountId)) {
      return {
        encryptionRestricted: true,
        anomalies: [],
        predictions: [],
      };
    }

    const [anomalies, predictions] = await Promise.all([
      this.detectSpendingAnomalies(accountId),
      this.getBudgetPredictions(accountId),
    ]);

    return { anomalies, predictions };
  }

  async detectSpendingAnomalies(accountId: string) {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get current month spending per category
    const currentExpenses = await this.prisma.expense.findMany({
      where: {
        accountId,
        isDeleted: false,
        date: { gte: currentMonthStart, lte: currentMonthEnd },
      },
      include: { category: true },
    });

    const currentByCategory = new Map<string, { amount: number; name: string }>();
    for (const expense of currentExpenses) {
      const categoryId = expense.categoryId || 'uncategorized';
      const categoryName = expense.category?.name || 'Uncategorized';
      const current = currentByCategory.get(categoryId) || { amount: 0, name: categoryName };
      currentByCategory.set(categoryId, {
        amount: current.amount + Number(expense.amount),
        name: categoryName,
      });
    }

    // Get previous 3 months spending per category for averages
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const previousExpenses = await this.prisma.expense.findMany({
      where: {
        accountId,
        isDeleted: false,
        date: { gte: threeMonthsAgo, lt: currentMonthStart },
      },
      include: { category: true },
    });

    const previousByCategory = new Map<string, { total: number; months: Set<string> }>();
    for (const expense of previousExpenses) {
      const categoryId = expense.categoryId || 'uncategorized';
      const monthKey = `${expense.date.getFullYear()}-${expense.date.getMonth()}`;
      const current = previousByCategory.get(categoryId) || { total: 0, months: new Set<string>() };
      current.total += Number(expense.amount);
      current.months.add(monthKey);
      previousByCategory.set(categoryId, current);
    }

    // Detect anomalies: current > average * 1.3
    const anomalies: Array<{
      categoryId: string;
      categoryName: string;
      currentAmount: number;
      averageAmount: number;
      percentageChange: number;
      period: string;
    }> = [];

    for (const [categoryId, currentData] of currentByCategory) {
      const previousData = previousByCategory.get(categoryId);
      if (!previousData || previousData.months.size === 0) continue;

      const monthCount = previousData.months.size;
      const averageAmount = previousData.total / monthCount;

      if (averageAmount <= 0) continue;

      const percentageChange = ((currentData.amount - averageAmount) / averageAmount) * 100;

      if (percentageChange >= 30) {
        anomalies.push({
          categoryId,
          categoryName: currentData.name,
          currentAmount: currentData.amount,
          averageAmount,
          percentageChange: Math.round(percentageChange),
          period: currentMonthStart.toISOString().slice(0, 7),
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

    for (const budget of budgets) {
      try {
        const progress = await this.budgetsService.getProgress(accountId, budget.id);
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
