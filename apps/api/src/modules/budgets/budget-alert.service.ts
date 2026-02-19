import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as ni18n from '../notifications/notification-i18n';

const THRESHOLDS = [50, 80, 100];

@Injectable()
export class BudgetAlertService {
  private readonly logger = new Logger(BudgetAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async checkBudgetsForAccount(accountId: string, expenseCurrencyCode: string): Promise<void> {
    try {
      const budgets = await this.prisma.budget.findMany({
        where: {
          accountId,
          isActive: true,
          isDeleted: false,
          currencyCode: expenseCurrencyCode,
        },
      });

      for (const budget of budgets) {
        await this.checkBudgetThresholds(accountId, budget);
      }
    } catch (error) {
      this.logger.error(`Budget alert check failed: ${error}`);
    }
  }

  async checkSpendingAnomalies(accountId: string, userId: string): Promise<void> {
    try {
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      // Current month spending per category
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
        if (!expense.categoryId) continue;
        const current = currentByCategory.get(expense.categoryId) || { amount: 0, name: expense.category?.name || 'Uncategorized' };
        currentByCategory.set(expense.categoryId, {
          amount: current.amount + Number(expense.amount),
          name: current.name,
        });
      }

      // Previous 3 months average per category
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      const previousExpenses = await this.prisma.expense.findMany({
        where: {
          accountId,
          isDeleted: false,
          date: { gte: threeMonthsAgo, lt: currentMonthStart },
        },
        select: { categoryId: true, amount: true, date: true },
      });

      const previousByCategory = new Map<string, { total: number; months: Set<string> }>();
      for (const expense of previousExpenses) {
        if (!expense.categoryId) continue;
        const monthKey = `${expense.date.getFullYear()}-${expense.date.getMonth()}`;
        const prev = previousByCategory.get(expense.categoryId) || { total: 0, months: new Set<string>() };
        prev.total += Number(expense.amount);
        prev.months.add(monthKey);
        previousByCategory.set(expense.categoryId, prev);
      }

      const monthKey = `${now.getFullYear()}-${now.getMonth()}`;

      for (const [categoryId, currentData] of currentByCategory) {
        const prevData = previousByCategory.get(categoryId);
        if (!prevData || prevData.months.size < 2) continue;

        const avgAmount = prevData.total / prevData.months.size;
        if (avgAmount <= 0) continue;

        const percentChange = ((currentData.amount - avgAmount) / avgAmount) * 100;
        if (percentChange < 30) continue;

        // Check if we already sent an anomaly alert for this category this month
        const alertKey = `anomaly:${categoryId}:${monthKey}`;
        const existingAlert = await this.prisma.budgetAlert.findFirst({
          where: {
            userId,
            thresholdPercentage: -1, // Use -1 as marker for anomaly alerts
            triggeredAt: { gte: currentMonthStart },
            budget: { categoryId },
          },
        });

        if (existingAlert) continue;

        // Find a budget for this category to link the alert (optional)
        const budget = await this.prisma.budget.findFirst({
          where: { accountId, categoryId, isActive: true, isDeleted: false },
        });

        if (!budget) continue;

        await this.prisma.budgetAlert.create({
          data: {
            budgetId: budget.id,
            userId,
            thresholdPercentage: -1, // Marker for spending anomaly
            currentSpent: currentData.amount,
            triggeredAt: new Date(),
            notificationSent: false,
          },
        });

        const roundedPercent = Math.round(percentChange);
        const anomalyParams = { categoryName: currentData.name, percent: roundedPercent };

        const sentOk = await this.notifications.sendToUser(
          userId,
          (lang) => ni18n.anomalyTitle(lang, anomalyParams),
          (lang) => ni18n.anomalyBody(lang, anomalyParams),
          { categoryId, percentChange: roundedPercent },
          'spending_anomaly',
        );

        if (sentOk) {
          this.logger.log(`Anomaly alert sent: ${currentData.name} +${roundedPercent}%`);
        }
      }
    } catch (error) {
      this.logger.error(`Spending anomaly check failed: ${error}`);
    }
  }

  private getCurrentPeriod(budget: any): { periodStart: Date; periodEnd: Date } {
    const now = new Date();
    switch (budget.period) {
      case 'daily':
        return {
          periodStart: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          periodEnd: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59),
        };
      case 'weekly': {
        const dayOfWeek = now.getDay();
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59);
        return { periodStart: startOfWeek, periodEnd: endOfWeek };
      }
      case 'monthly':
        return {
          periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
          periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
        };
      case 'yearly':
        return {
          periodStart: new Date(now.getFullYear(), 0, 1),
          periodEnd: new Date(now.getFullYear(), 11, 31, 23, 59, 59),
        };
      case 'custom':
      default:
        return {
          periodStart: budget.startDate,
          periodEnd: budget.endDate || now,
        };
    }
  }

  private async checkBudgetThresholds(accountId: string, budget: any): Promise<void> {
    const { periodStart, periodEnd } = this.getCurrentPeriod(budget);

    const whereExpenses: any = {
      accountId,
      isDeleted: false,
      currencyCode: budget.currencyCode,
      date: { gte: periodStart, lte: periodEnd },
    };

    if (budget.categoryId) {
      whereExpenses.categoryId = budget.categoryId;
    }

    const result = await this.prisma.expense.aggregate({
      where: whereExpenses,
      _sum: { amount: true },
    });

    const spent = Number(result._sum?.amount || 0);
    const budgetAmount = Number(budget.amount);
    if (budgetAmount <= 0) return;

    const percentUsed = (spent / budgetAmount) * 100;

    for (const threshold of THRESHOLDS) {
      if (percentUsed >= threshold) {
        const existing = await this.prisma.budgetAlert.findFirst({
          where: {
            budgetId: budget.id,
            thresholdPercentage: threshold,
            triggeredAt: { gte: periodStart },
          },
        });

        if (!existing) {
          const alert = await this.prisma.budgetAlert.create({
            data: {
              budgetId: budget.id,
              userId: budget.userId,
              thresholdPercentage: threshold,
              currentSpent: spent,
              triggeredAt: new Date(),
              notificationSent: false,
            },
          });

          const budgetParams = {
            budgetName: budget.name,
            threshold,
            currencyCode: budget.currencyCode,
            spent: spent.toFixed(2),
            total: budgetAmount.toFixed(2),
          };

          const sentOk = await this.notifications.sendToUser(
            budget.userId,
            threshold >= 100
              ? (lang) => ni18n.budgetExceededTitle(lang, budgetParams)
              : (lang) => ni18n.budgetThresholdTitle(lang, budgetParams),
            threshold >= 100
              ? (lang) => ni18n.budgetExceededBody(lang, budgetParams)
              : (lang) => ni18n.budgetThresholdBody(lang, budgetParams),
            {
              budgetId: budget.id,
              alertId: alert.id,
              thresholdPercentage: threshold,
            },
            'budget_alert',
          );

          if (sentOk) {
            await this.prisma.budgetAlert.update({
              where: { id: alert.id },
              data: { notificationSent: true },
            });
          }
        }
      }
    }
  }
}
