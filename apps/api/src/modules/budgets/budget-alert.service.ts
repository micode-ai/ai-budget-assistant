import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

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

  private async checkBudgetThresholds(accountId: string, budget: any): Promise<void> {
    const periodStart = budget.startDate;
    const periodEnd = budget.endDate || new Date();

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

          const title = threshold >= 100
            ? `Budget "${budget.name}" exceeded!`
            : `Budget "${budget.name}" at ${threshold}%`;
          const body = threshold >= 100
            ? `You've spent ${budget.currencyCode} ${spent.toFixed(2)} of your ${budget.currencyCode} ${budgetAmount.toFixed(2)} budget.`
            : `${budget.currencyCode} ${spent.toFixed(2)} of ${budget.currencyCode} ${budgetAmount.toFixed(2)} used.`;

          const sentOk = await this.notifications.sendToUser(
            budget.userId,
            title,
            body,
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
