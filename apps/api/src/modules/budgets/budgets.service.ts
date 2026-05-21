import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { CacheService } from '../../common/cache/cache.service';

const CATEGORY_ALLOCATIONS_INCLUDE = {
  categoryAllocations: {
    where: { isDeleted: false },
    include: { category: true },
  },
};

// Mirrors getStartOfWeek/getEndOfWeek from @budget/shared-utils. Inlined
// because @budget/shared-utils is bundler-only (its index.ts uses extensionless
// directory re-exports that Node ESM rejects with ERR_UNSUPPORTED_DIR_IMPORT
// in the API runtime). The mobile/admin builds bundle the package, so they're
// fine; only the API hits the raw Node loader.
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as first day
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date): Date {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

// Compute the rolling [periodStart, periodEnd] window for a budget. For
// daily/weekly/monthly/yearly budgets the window tracks the current calendar
// period rather than `budget.startDate` (otherwise a long-lived monthly budget
// would sum every month's expenses since it was created). `custom` budgets
// keep their fixed [startDate, endDate] window. Mirrors the mobile store
// logic in apps/mobile/src/stores/budgetStore.ts so API and client agree.
export function computeBudgetPeriod(
  budget: { period: string; startDate: Date; endDate: Date | null },
  now: Date = new Date(),
): { periodStart: Date; periodEnd: Date } {
  switch (budget.period) {
    case 'daily': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { periodStart: start, periodEnd: end };
    }
    case 'weekly':
      return { periodStart: startOfWeek(now), periodEnd: endOfWeek(now) };
    case 'yearly': {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { periodStart: start, periodEnd: end };
    }
    case 'custom':
      return {
        periodStart: budget.startDate,
        periodEnd: budget.endDate ?? now,
      };
    case 'monthly':
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      return { periodStart: start, periodEnd: end };
    }
  }
}

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamificationService: GamificationService,
    private readonly cacheService: CacheService,
  ) {}

  private invalidateChatCache(accountId: string): void {
    if (!accountId) return;
    void this.cacheService.delByPrefix(`chat:get_budget_status:${accountId}:`);
  }

  private async resolveCategoryId(categoryId: string | undefined | null, accountId: string): Promise<string | null> {
    if (!categoryId) return null;
    // UUID v4 pattern — use directly
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId)) {
      // Verify it exists
      const cat = await this.prisma.category.findFirst({
        where: { id: categoryId, OR: [{ accountId }, { accountId: null }] },
        select: { id: true },
      });
      return cat?.id ?? null;
    }
    // Try exact name match
    const category = await this.prisma.category.findFirst({
      where: {
        name: { equals: categoryId, mode: 'insensitive' },
        OR: [{ accountId }, { accountId: null }],
      },
      select: { id: true },
    });
    return category?.id ?? null;
  }

  private async resolveCategoryAllocations(
    categories: { categoryId: string; amount: number }[],
    accountId: string,
  ): Promise<{ categoryId: string; amount: number }[]> {
    const resolved: { categoryId: string; amount: number }[] = [];
    for (const cat of categories) {
      const resolvedId = await this.resolveCategoryId(cat.categoryId, accountId);
      if (resolvedId) {
        resolved.push({ categoryId: resolvedId, amount: cat.amount });
      }
    }
    return resolved;
  }

  async create(accountId: string, userId: string, dto: any) {
    return this.prisma.$transaction(async (tx) => {
      // Validate categoryId for legacy single-category mode
      const resolvedCategoryId = dto.categoryId && (!dto.categories || dto.categories.length === 0)
        ? await this.resolveCategoryId(dto.categoryId, accountId)
        : null;

      // Resolve category allocations before creating
      const resolvedAllocations = dto.categories && dto.categories.length > 0
        ? await this.resolveCategoryAllocations(dto.categories, accountId)
        : [];

      const budget = await tx.budget.create({
        data: {
          accountId,
          userId,
          clientId: dto.localId,
          name: dto.name,
          amount: dto.amount,
          currencyCode: dto.currencyCode,
          period: dto.period,
          startDate: new Date(dto.startDate),
          endDate: dto.endDate ? new Date(dto.endDate) : null,
          categoryId: resolvedCategoryId,
          alertThreshold: dto.alertThreshold || 80,
        },
      });

      // Create category allocations if provided
      if (resolvedAllocations.length > 0) {
        await tx.budgetCategory.createMany({
          data: resolvedAllocations.map((cat) => ({
            budgetId: budget.id,
            categoryId: cat.categoryId,
            amount: cat.amount,
          })),
        });
      }

      const result = await tx.budget.findUnique({
        where: { id: budget.id },
        include: { category: true, ...CATEGORY_ALLOCATIONS_INCLUDE },
      });

      // Fire-and-forget gamification check
      this.gamificationService.checkAchievements(accountId, userId).catch(() => {});

      this.invalidateChatCache(accountId);

      return result;
    });
  }

  async findAll(accountId: string, filters: any = {}) {
    const where: any = { accountId, isDeleted: false };

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }
    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    return this.prisma.budget.findMany({
      where,
      include: { category: true, ...CATEGORY_ALLOCATIONS_INCLUDE },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(accountId: string, id: string) {
    const budget = await this.prisma.budget.findFirst({
      where: { id, accountId, isDeleted: false },
      include: { category: true, ...CATEGORY_ALLOCATIONS_INCLUDE },
    });

    if (!budget) {
      throw new NotFoundException('Budget not found');
    }

    return budget;
  }

  async update(accountId: string, id: string, dto: any) {
    const budget = await this.findOne(accountId, id);

    return this.prisma.$transaction(async (tx) => {
      const { categories, ...budgetFields } = dto;

      await tx.budget.update({
        where: { id: budget.id },
        data: {
          ...budgetFields,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          syncVersion: { increment: 1 },
        },
      });

      // Replace category allocations if provided
      if (categories !== undefined) {
        // Hard-delete existing allocations (unique constraint requires actual removal)
        await tx.budgetCategory.deleteMany({
          where: { budgetId: budget.id },
        });

        if (categories.length > 0) {
          const resolvedAllocations = await this.resolveCategoryAllocations(categories, accountId);
          if (resolvedAllocations.length > 0) {
            await tx.budgetCategory.createMany({
              data: resolvedAllocations.map((cat) => ({
                budgetId: budget.id,
                categoryId: cat.categoryId,
                amount: cat.amount,
              })),
            });
          }

          // Clear legacy categoryId when using multi-category
          await tx.budget.update({
            where: { id: budget.id },
            data: { categoryId: null },
          });
        }
      }

      return tx.budget.findUnique({
        where: { id: budget.id },
        include: { category: true, ...CATEGORY_ALLOCATIONS_INCLUDE },
      });
    }).then((updated) => {
      this.invalidateChatCache(accountId);
      return updated;
    });
  }

  async remove(accountId: string, id: string) {
    const budget = await this.findOne(accountId, id);

    await this.prisma.budget.update({
      where: { id: budget.id },
      data: {
        isDeleted: true,
        syncVersion: { increment: 1 },
      },
    });

    this.invalidateChatCache(accountId);

    return { success: true };
  }

  async getHistory(accountId: string, id: string, periods: number = 6) {
    const budget = await this.findOne(accountId, id);
    if (budget.period === 'custom') return [];

    const periodsCount = Math.min(Math.max(1, periods), 12);
    const now = new Date();

    const allocations = (budget as any).categoryAllocations || [];
    const hasMultiCategory = allocations.length > 0;
    const categoryIds = hasMultiCategory
      ? allocations.map((a: any) => a.categoryId)
      : (budget as any).categoryId ? [(budget as any).categoryId] : null;

    const results: {
      periodStart: string;
      periodEnd: string;
      limit: number;
      actual: number;
      isOverBudget: boolean;
    }[] = [];

    for (let i = 0; i < periodsCount; i++) {
      // Compute reference date i steps back from now
      const ref = new Date(now);
      switch (budget.period) {
        case 'daily':
          ref.setDate(ref.getDate() - i);
          break;
        case 'weekly':
          ref.setDate(ref.getDate() - i * 7);
          break;
        case 'monthly':
          ref.setMonth(ref.getMonth() - i);
          break;
        case 'yearly':
          ref.setFullYear(ref.getFullYear() - i);
          break;
      }

      const { periodStart, periodEnd } = computeBudgetPeriod(budget, ref);

      const whereExpenses: any = {
        accountId,
        isDeleted: false,
        currencyCode: budget.currencyCode,
        date: { gte: periodStart, lte: periodEnd },
      };
      if (categoryIds) {
        whereExpenses.categoryId = { in: categoryIds };
      }

      const spent = await this.prisma.expense.aggregate({
        where: whereExpenses,
        _sum: { amount: true },
      });

      const actual = Number(spent._sum?.amount || 0);
      const limit = Number(budget.amount);

      results.push({
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        limit,
        actual,
        isOverBudget: actual > limit,
      });
    }

    // Return in chronological order (oldest first)
    return results.reverse();
  }

  async getProgress(accountId: string, id: string) {
    const budget = await this.findOne(accountId, id);

    // Calculate spent amount for this budget period
    const now = new Date();
    const { periodStart, periodEnd } = computeBudgetPeriod(budget, now);

    // Determine which categories this budget covers
    const allocations = budget.categoryAllocations || [];
    const hasMultiCategory = allocations.length > 0;
    const categoryIds = hasMultiCategory
      ? allocations.map((a: any) => a.categoryId)
      : budget.categoryId ? [budget.categoryId] : null;

    const whereExpenses: any = {
      accountId,
      isDeleted: false,
      currencyCode: budget.currencyCode,
      date: {
        gte: periodStart,
        lte: periodEnd,
      },
    };

    if (categoryIds) {
      whereExpenses.categoryId = { in: categoryIds };
    }

    const spent = await this.prisma.expense.aggregate({
      where: whereExpenses,
      _sum: { amount: true },
    });

    const spentAmount = Number(spent._sum?.amount || 0);
    const budgetAmount = Number(budget.amount);
    const remaining = Math.max(0, budgetAmount - spentAmount);
    // Precomputed so AI consumers don't have to do (spent − amount) themselves
    // — LLMs hallucinate arithmetic on similar-looking PLN/UAH amounts.
    const overBy = Math.max(0, spentAmount - budgetAmount);
    const percentageUsed = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;
    const isOverBudget = spentAmount > budgetAmount;

    // Calculate prediction fields
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysElapsed = Math.max(1, Math.ceil((now.getTime() - periodStart.getTime()) / msPerDay));
    const totalDaysInPeriod = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / msPerDay));
    const daysRemaining = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / msPerDay));

    const dailyBurnRate = spentAmount / daysElapsed;
    const projectedTotal = dailyBurnRate * totalDaysInPeriod;

    // Estimate when budget will run out
    let estimatedExhaustionDate: string | undefined;
    if (dailyBurnRate > 0 && !isOverBudget) {
      const daysUntilExhaustion = remaining / dailyBurnRate;
      const exhaustionDate = new Date(now.getTime() + daysUntilExhaustion * msPerDay);
      if (exhaustionDate <= periodEnd) {
        estimatedExhaustionDate = exhaustionDate.toISOString();
      }
    }

    // Per-category breakdown for multi-category budgets
    let categoryBreakdown: any[] | undefined;
    if (hasMultiCategory) {
      const categorySpending = await this.prisma.expense.groupBy({
        by: ['categoryId'],
        where: whereExpenses,
        _sum: { amount: true },
      });

      const spendingMap = new Map(
        categorySpending.map((cs) => [cs.categoryId, Number(cs._sum?.amount || 0)]),
      );

      categoryBreakdown = allocations.map((alloc: any) => {
        const catSpent = spendingMap.get(alloc.categoryId) || 0;
        const catAllocated = Number(alloc.amount);
        return {
          categoryId: alloc.categoryId,
          categoryName: alloc.category?.name || 'Unknown',
          categoryColor: alloc.category?.color,
          allocated: catAllocated,
          spent: catSpent,
          remaining: Math.max(0, catAllocated - catSpent),
          percentageUsed: catAllocated > 0 ? (catSpent / catAllocated) * 100 : 0,
          isOverBudget: catSpent > catAllocated,
        };
      });
    }

    return {
      budget,
      spent: spentAmount,
      remaining,
      overBy,
      percentageUsed,
      isOverBudget,
      daysRemaining,
      projectedTotal,
      dailyBurnRate,
      estimatedExhaustionDate,
      categoryBreakdown,
    };
  }
}
