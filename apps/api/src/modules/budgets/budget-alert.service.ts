import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as ni18n from '../notifications/notification-i18n';
import { computeBudgetPeriod } from './budget-period.util';
import { EXCLUDE_SPLIT_RECEIVABLE, categoryOrSplitFilter } from '../../common/utils/expense-filters';
import { attributeToCategories } from '../../common/utils/category-attribution';

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
          categoryAllocations: { where: { isDeleted: false }, include: { category: true } },
          account: { select: { monthAnchorDay: true } },
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
    // No request is threaded into this method (it's invoked fire-and-forget
    // from ExpensesController, not from a @Cron job), so the anchor comes from
    // the budget's own account relation (included above), not req.monthAnchorDay.
    const { periodStart, periodEnd } = computeBudgetPeriod(
      budget,
      undefined,
      budget.account?.monthAnchorDay ?? null,
    );

    const whereExpenses: any = {
      accountId,
      isDeleted: false,
      isPlanned: false,
      // see common/utils/expense-filters.ts for the full rationale
      ...EXCLUDE_SPLIT_RECEIVABLE,
      currencyCode: budget.currencyCode,
      date: { gte: periodStart, lte: periodEnd },
    };

    // Multi-category support. An expense whose OWN category is outside the
    // budget can still hold a split into it, so the category filter cannot
    // live in SQL alone — see
    // docs/superpowers/specs/2026-09-10-budget-split-attribution-design.md.
    const allocations = budget.categoryAllocations || [];
    const categoryIds: string[] | null =
      allocations.length > 0 ? allocations.map((a: any) => a.categoryId) : null;
    let spent: number;

    // Branch on `categoryIds` itself rather than on a derived set:
    // `strictNullChecks` is on and TypeScript cannot correlate a derived
    // variable's null-ness with its source's, so narrowing here is what
    // lets `categoryIds` be passed on below without a non-null assertion.
    if (!categoryIds) {
      const result = await this.prisma.expense.aggregate({
        where: whereExpenses,
        _sum: { amount: true },
      });
      spent = Number(result._sum?.amount || 0);
    } else {
      const categorySet = new Set<string>(categoryIds);

      Object.assign(whereExpenses, categoryOrSplitFilter(categoryIds));

      const rows = await this.prisma.expense.findMany({
        where: whereExpenses,
        select: {
          amount: true,
          categoryId: true,
          categorySplits: {
            where: { isDeleted: false },
            select: { categoryId: true, amount: true },
          },
        },
      });

      spent = 0;
      for (const row of rows) {
        for (const part of attributeToCategories(row)) {
          if (part.categoryId && categorySet.has(part.categoryId)) spent += part.amount;
        }
      }
    }

    const budgetAmount = Number(budget.amount);
    if (budgetAmount <= 0) return;

    const percentUsed = (spent / budgetAmount) * 100;

    for (const threshold of THRESHOLDS) {
      if (percentUsed >= threshold) {
        // Check if alert already exists for this threshold+period (already sent or not)
        const existingAlert = await this.prisma.budgetAlert.findFirst({
          where: { budgetId: budget.id, categoryId: null, thresholdPercentage: threshold, periodStart },
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
            where: { budgetId: budget.id, categoryId: null, thresholdPercentage: threshold, periodStart },
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

    await this.checkCategoryThresholds(accountId, budget, periodStart, periodEnd);
  }

  private async checkCategoryThresholds(
    accountId: string,
    budget: any,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    const allocations = (budget.categoryAllocations || []).filter((a: any) => !a.isDeleted);
    if (allocations.length === 0) return;

    const allocationCategoryIds = allocations.map((a: any) => a.categoryId);

    const categorySet = new Set<string>(allocationCategoryIds);

    const rows = await this.prisma.expense.findMany({
      where: {
        accountId,
        date: { gte: periodStart, lte: periodEnd },
        isDeleted: false,
        isPlanned: false,
        ...EXCLUDE_SPLIT_RECEIVABLE,
        currencyCode: budget.currencyCode,
        ...categoryOrSplitFilter(allocationCategoryIds),
      },
      select: {
        amount: true,
        categoryId: true,
        categorySplits: {
          where: { isDeleted: false },
          select: { categoryId: true, amount: true },
        },
      },
    });

    const spentMap = new Map<string, number>();
    for (const row of rows) {
      for (const part of attributeToCategories(row)) {
        if (!part.categoryId || !categorySet.has(part.categoryId)) continue;
        spentMap.set(part.categoryId, (spentMap.get(part.categoryId) ?? 0) + part.amount);
      }
    }

    for (const allocation of allocations) {
      const categoryId: string = allocation.categoryId;
      const categoryName: string = allocation.category?.name ?? categoryId;
      const allocated = Number(allocation.amount);
      if (allocated <= 0) continue;

      const spent = spentMap.get(categoryId) ?? 0;
      const percentUsed = (spent / allocated) * 100;

      for (const threshold of THRESHOLDS) {
        if (percentUsed < threshold) continue;

        const existingAlert = await this.prisma.budgetAlert.findFirst({
          where: { budgetId: budget.id, categoryId, thresholdPercentage: threshold, periodStart },
        });

        if (existingAlert) continue;

        const insertResult = await this.prisma.budgetAlert.createMany({
          data: [{
            budgetId: budget.id,
            categoryId,
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
            where: { budgetId: budget.id, categoryId, thresholdPercentage: threshold, periodStart },
            orderBy: { triggeredAt: 'desc' },
          });

          if (alert && !alert.notificationSent) {
            await this.prisma.budgetAlert.update({
              where: { id: alert.id },
              data: { notificationSent: true },
            });

            const categoryParams = {
              budgetName: budget.name,
              categoryName,
              threshold,
            };

            const sentOk = await this.notifications.sendToUser(
              budget.userId,
              threshold >= 100
                ? (lang: string) => ni18n.budgetCategoryExceededTitle(lang, categoryParams)
                : (lang: string) => ni18n.budgetCategoryThresholdTitle(lang, categoryParams),
              threshold >= 100
                ? (lang: string) => ni18n.budgetCategoryExceededBody(lang, categoryParams)
                : (lang: string) => ni18n.budgetCategoryThresholdBody(lang, categoryParams),
              {
                budgetId: budget.id,
                alertId: alert.id,
                thresholdPercentage: threshold,
                categoryId,
                categoryName,
              },
              'budget_alert',
            );

            if (!sentOk) {
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
