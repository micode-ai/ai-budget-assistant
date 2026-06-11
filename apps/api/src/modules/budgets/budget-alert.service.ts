import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as ni18n from '../notifications/notification-i18n';
import { computeBudgetPeriod } from './budget-period.util';

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
        include: {
          categoryAllocations: { where: { isDeleted: false } },
        },
      });

      for (const budget of budgets) {
        await this.checkBudgetThresholds(accountId, budget);
      }
    } catch (error) {
      this.logger.error(`Budget alert check failed: ${error}`);
    }
  }

  private async checkBudgetThresholds(accountId: string, budget: any): Promise<void> {
    const { periodStart, periodEnd } = computeBudgetPeriod(budget);

    const whereExpenses: any = {
      accountId,
      isDeleted: false,
      currencyCode: budget.currencyCode,
      date: { gte: periodStart, lte: periodEnd },
    };

    // Multi-category support: filter by all allocated category IDs
    const allocations = budget.categoryAllocations || [];
    if (allocations.length > 0) {
      whereExpenses.categoryId = { in: allocations.map((a: any) => a.categoryId) };
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
        // Check if alert already exists for this threshold+period (already sent or not)
        const existingAlert = await this.prisma.budgetAlert.findFirst({
          where: { budgetId: budget.id, thresholdPercentage: threshold, periodStart },
        });

        if (existingAlert) {
          // Alert already exists — skip to avoid duplicate notifications
          continue;
        }

        // Try to insert; skipDuplicates handles the race between concurrent requests
        const insertResult = await this.prisma.budgetAlert.createMany({
          data: [{
            budgetId: budget.id,
            userId: budget.userId,
            thresholdPercentage: threshold,
            currentSpent: spent,
            periodStart,
            triggeredAt: new Date(),
            notificationSent: false,
          }],
          skipDuplicates: true,
        });

        if (insertResult.count > 0) {
          const alert = await this.prisma.budgetAlert.findFirst({
            where: { budgetId: budget.id, thresholdPercentage: threshold, periodStart },
            orderBy: { triggeredAt: 'desc' },
          });

          if (alert && !alert.notificationSent) {
            // Mark as sent BEFORE actually sending to prevent concurrent sends
            await this.prisma.budgetAlert.update({
              where: { id: alert.id },
              data: { notificationSent: true },
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

            if (!sentOk) {
              // Rollback: allow retry on next check
              await this.prisma.budgetAlert.update({
                where: { id: alert.id },
                data: { notificationSent: false },
              });
            }
          }
        }
      }
    }
  }
}
