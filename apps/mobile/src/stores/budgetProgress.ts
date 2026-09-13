/**
 * budgetProgress.ts — budget progress/projection computation extracted from
 * budgetStore.ts. Pure functions over a `budgets` array (no `set`/`get`
 * needed, unlike the CRUD/sync modules) so they can be unit-tested without
 * mocking Zustand — the store's `getBudgetProgress`/`getMonthlyBudgetSummary`
 * are now thin wrappers that pass `get().budgets` through.
 *
 * The projection arithmetic itself (`projectBudgetSpend`) is NOT
 * reimplemented here — it is imported from `@budget/shared-utils`, the
 * canonical mirror of `apps/api/src/common/utils/budget-projection.ts`
 * (ABA-523's "mean of daily totals excluding the largest day" fix). This
 * module only assembles the period/attribution/category-breakdown context
 * around that shared formula so the mobile UI can render offline.
 */
import type { Budget, BudgetProgress, BudgetCategoryProgress } from '@budget/shared-types';
import { projectBudgetSpend, computeBudgetPeriod } from '@budget/shared-utils';
import { useExpenseStore } from './expenseStore';
import { useCategoryStore } from './categoryStore';
import { useExchangeRateStore } from './exchangeRateStore';
import { readAnchorDay } from '@/hooks/useFinancialMonth';
import { filterConsumption } from '@/utils/consumption';
import { categoryLabel } from '@/utils/entityLabel';
import { attributeBudgetSpend } from '@/features/budgets/budgetAttribution';

export function computeBudgetProgress(
  budgets: Budget[],
  budgetId: string,
  referenceDate?: Date,
): BudgetProgress | null {
  const budget = budgets.find((b) => b.id === budgetId);
  if (!budget || budget.isDeleted) return null;

  const expenses = filterConsumption(useExpenseStore.getState().expenses).filter(
    // `isPlanned` is filtered in SQL by loadAllExpenses on native, but the
    // web build has no SQLite and takes this list from the server pull.
    (e) => !e.isDeleted && !e.isPlanned,
  );

  const now = referenceDate ?? new Date();
  // Store, not a component — reads the anchor via the shared, unit-tested
  // readAnchorDay() helper rather than useFinancialMonth (which is a hook).
  const anchorDay = readAnchorDay();
  const { periodStart, periodEnd } = computeBudgetPeriod(budget, now, anchorDay);

  // Filter expenses for this budget period and matching currency
  let periodExpenses = expenses.filter((e) => {
    const expenseDate = new Date(e.date);
    return expenseDate >= periodStart && expenseDate <= periodEnd;
  });

  // Filter by currency to match budget currency
  periodExpenses = periodExpenses.filter((e) => e.currencyCode === budget.currencyCode);

  // Multi-category support
  const allocations = budget.categoryAllocations || [];
  const hasMultiCategory = allocations.length > 0;

  const categorySet = hasMultiCategory
    ? new Set(allocations.map((a) => a.categoryId))
    : null;

  const attribution = attributeBudgetSpend(periodExpenses, categorySet);
  const spent = attribution.spent;
  const remaining = Math.max(0, budget.amount - spent);
  const percentageUsed = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
  const isOverBudget = spent > budget.amount;

  // Calculate days remaining
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / msPerDay));

  // Project total spending
  const daysPassed = Math.max(1, Math.ceil((now.getTime() - periodStart.getTime()) / msPerDay));
  const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / msPerDay);

  const estimate = projectBudgetSpend({
    spent,
    dailyTotals: [...attribution.byDay.values()],
    daysElapsed: daysPassed,
    totalDays,
  });

  // `spent` when it declines to project (too little of the period behind
  // us). Deliberately not a nullable field: every consumer gates its
  // sentence on `projectedTotal > budget.amount`, so the money already
  // spent is both the honest floor and the value that makes them all fall
  // silent. Mirrors `budgets.service.ts`.
  const projectedTotal = estimate.projectedTotal ?? spent;
  const dailyBurnRate = estimate.dailyRate ?? 0;

  // Estimate exhaustion date
  let estimatedExhaustionDate: Date | undefined;
  if (dailyBurnRate > 0 && !isOverBudget) {
    const daysUntilExhaustion = remaining / dailyBurnRate;
    const exhaustionDate = new Date(now.getTime() + daysUntilExhaustion * msPerDay);
    if (exhaustionDate <= periodEnd) {
      estimatedExhaustionDate = exhaustionDate;
    }
  }

  // Per-category breakdown for multi-category budgets
  let categoryBreakdown: BudgetCategoryProgress[] | undefined;
  if (hasMultiCategory) {
    const categoriesState = useCategoryStore.getState();
    categoryBreakdown = allocations.map((alloc) => {
      const catSpent = attribution.byCategory.get(alloc.categoryId) ?? 0;
      const cat = categoriesState.categories.find((c) => c.id === alloc.categoryId);
      return {
        categoryId: alloc.categoryId,
        categoryName: categoryLabel(cat),
        categoryColor: cat?.color,
        allocated: alloc.amount,
        spent: catSpent,
        remaining: Math.max(0, alloc.amount - catSpent),
        percentageUsed: alloc.amount > 0 ? (catSpent / alloc.amount) * 100 : 0,
        isOverBudget: catSpent > alloc.amount,
      };
    });
  }

  return {
    budget,
    spent,
    remaining,
    percentageUsed,
    isOverBudget,
    daysRemaining,
    projectedTotal,
    dailyBurnRate,
    estimatedExhaustionDate,
    categoryBreakdown,
  };
}

export interface MonthlyBudgetSummary {
  totalAmount: number;
  totalSpent: number;
  // Count of active monthly budgets. When isOverall=true the card shows
  // only the overall; this count still reflects all active monthlies and
  // is used to decide whether the card is rendered at all.
  budgetCount: number;
  isOverall: boolean;
}

export function computeMonthlyBudgetSummary(budgets: Budget[]): MonthlyBudgetSummary {
  const activeMonthly = budgets.filter(
    (b) => b.isActive && !b.isDeleted && b.period === 'monthly',
  );

  const { rates, baseCurrency } = useExchangeRateStore.getState();
  const convertToBase = (amount: number, fromCurrency: string) => {
    if (!baseCurrency || fromCurrency === baseCurrency) return amount;
    const rate = rates[fromCurrency];
    if (!rate || rate === 0) return amount;
    return amount / rate;
  };

  if (activeMonthly.length === 0) {
    return { totalAmount: 0, totalSpent: 0, budgetCount: 0, isOverall: false };
  }

  const overall = activeMonthly.find(
    (b) => !b.categoryAllocations || b.categoryAllocations.length === 0,
  );

  // progress.spent is always in the budget's own currency —
  // computeBudgetProgress filters expenses by budget.currencyCode and does
  // not convert. Both amount and spent are converted to base here in
  // parallel.
  if (overall) {
    const progress = computeBudgetProgress(budgets, overall.id);
    const spent = progress ? progress.spent : 0;
    return {
      totalAmount: convertToBase(overall.amount, overall.currencyCode),
      totalSpent: convertToBase(spent, overall.currencyCode),
      budgetCount: activeMonthly.length,
      isOverall: true,
    };
  }

  let totalAmount = 0;
  let totalSpent = 0;
  for (const b of activeMonthly) {
    totalAmount += convertToBase(b.amount, b.currencyCode);
    const progress = computeBudgetProgress(budgets, b.id);
    if (progress) {
      totalSpent += convertToBase(progress.spent, b.currencyCode);
    }
  }

  return {
    totalAmount,
    totalSpent,
    budgetCount: activeMonthly.length,
    isOverall: false,
  };
}
