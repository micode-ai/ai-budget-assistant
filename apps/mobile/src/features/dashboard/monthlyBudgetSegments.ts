import type { Budget, BudgetCategoryProgress, BudgetProgress, Currency } from '@budget/shared-types';

/**
 * Data for a real segmented allocation bar on the dashboard's monthly-budget
 * card (`docs/design/2026-09-05-dashboard-web.md`'s "The monthly budget
 * card's segmented bar"). Shaped to feed `SegmentedProgressBar` directly
 * (`categories`/`totalAmount`/`percentageUsed`/`currencyCode`) — the caller
 * still computes its own `barColor`, same as `BudgetCard` does, since that's
 * a rendering decision, not data.
 */
export interface MonthlyBudgetSegments {
  categories: BudgetCategoryProgress[];
  totalAmount: number;
  percentageUsed: number;
  currencyCode: Currency;
}

/**
 * Resolves segments for the dashboard's monthly-budget card — but only for
 * the ONE case the design commits to: the month reduces to exactly one
 * active, category-allocated monthly budget. `budgetStore.getMonthlyBudgetSummary()`
 * blends every active monthly budget into one pair of numbers and carries no
 * per-category data, so outside that single-budget case there is nothing
 * honest to segment — this returns `null` rather than inventing a split
 * across budgets the mockup never specified how to combine (design: "a bar
 * that invents a split across merged budgets would be a wrong number...
 * worse than no bar").
 *
 * Mirrors `getMonthlyBudgetSummary()`'s own filter and "overall" detection
 * exactly, so this can never disagree with the number the plain (non-
 * segmented) card already shows:
 * - No active monthly budget at all → `null` (nothing to show, same as
 *   `budgetCount === 0`).
 * - Any active monthly budget with no category allocations (an "overall"
 *   budget) → `null`. `getMonthlyBudgetSummary()` takes that budget's own
 *   totals alone in this case, and an overall budget by definition has
 *   nothing to segment.
 * - More than one active, category-allocated monthly budget → `null`. This
 *   is the merged case: `getMonthlyBudgetSummary()` sums them into one
 *   number, and there is no data here for how their allocations should
 *   combine into shared segments.
 * - Exactly one active, category-allocated monthly budget → its own
 *   `categoryBreakdown`, `amount` and `percentageUsed`, unblended.
 *
 * `getBudgetProgress` is injected (not read from the store directly) so this
 * stays a pure function of its inputs — same shape as `classifyBudget`
 * (`features/budgets/budgetGrouping.ts`), which likewise takes an
 * already-resolved `BudgetProgress` rather than reaching into the store.
 */
export function resolveMonthlyBudgetSegments(
  budgets: Budget[],
  getBudgetProgress: (budgetId: string) => BudgetProgress | null,
): MonthlyBudgetSegments | null {
  const activeMonthly = budgets.filter((b) => b.isActive && !b.isDeleted && b.period === 'monthly');
  if (activeMonthly.length === 0) return null;

  const hasOverall = activeMonthly.some(
    (b) => !b.categoryAllocations || b.categoryAllocations.length === 0,
  );
  if (hasOverall) return null;

  if (activeMonthly.length !== 1) return null;

  const [budget] = activeMonthly;
  const progress = getBudgetProgress(budget.id);
  if (!progress || !progress.categoryBreakdown || progress.categoryBreakdown.length === 0) return null;

  return {
    categories: progress.categoryBreakdown,
    totalAmount: budget.amount,
    percentageUsed: progress.percentageUsed,
    currencyCode: budget.currencyCode,
  };
}
