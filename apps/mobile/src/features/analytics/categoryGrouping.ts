import type { ExpenseCategorySplit } from '@budget/shared-types';

/**
 * The minimal shape category grouping needs from an expense. Kept narrow
 * (rather than importing the full `Expense` type, which would drag this pure
 * module into the store-import graph) so it can be unit-tested with plain
 * literals and no store/DB setup.
 */
export interface SplittableExpense {
  categoryId?: string | null;
  currencyCode: string;
  amount: number;
  splits?: ExpenseCategorySplit[];
}

/**
 * Groups expenses into per-category converted totals — the single rule that
 * governs both `useCategoryAnalytics`'s current-period breakdown and its
 * trailing-month average.
 *
 * An expense with one or more (non-deleted) category splits contributes each
 * split's own converted amount to its own category — never its whole amount
 * to `categoryId` (that would double count the categories the split moved
 * money into). An expense with no splits — every expense that existed before
 * receipt-category-autosplit, and every expense a user never split —
 * contributes its whole converted amount to `categoryId`, unchanged from
 * before splits existed. `null` is the map key for "no category" (mirrors the
 * pre-existing `expense.categoryId || null` convention).
 *
 * Applying this same rule to both the current period AND the trailing months
 * matters: if the current period grouped by splits while trailing months
 * kept grouping by the expense's own `categoryId`, a split category's
 * trailing total would read the FULL pre-split receipt amount every month
 * while its current total reads only its own share — comparing two different
 * quantities and reporting a fabricated swing for every split category, even
 * when the underlying spending pattern is flat.
 */
export function groupExpensesByCategory(
  items: SplittableExpense[],
  convert: (amount: number, currencyCode: string) => number,
): Map<string | null, number> {
  const map = new Map<string | null, number>();
  for (const item of items) {
    const activeSplits = item.splits?.filter((s) => !s.isDeleted);
    if (activeSplits && activeSplits.length > 0) {
      for (const split of activeSplits) {
        const key = split.categoryId || null;
        map.set(key, (map.get(key) || 0) + convert(split.amount, item.currencyCode));
      }
    } else {
      const key = item.categoryId || null;
      map.set(key, (map.get(key) || 0) + convert(item.amount, item.currencyCode));
    }
  }
  return map;
}

/**
 * The rolling trailing-month delta formula behind `CategorySpending.vsAverage`,
 * extracted so the hook and its tests share one implementation instead of two.
 * `monthlyTotals` is expected to be (but is not required to be) the same
 * length every call — the average is taken over however many months are given.
 */
export function computeVsAverage(currentAmount: number, monthlyTotals: number[]): number | null {
  if (monthlyTotals.length === 0 || !monthlyTotals.some((t) => t > 0)) return null;
  const rollingAverage = monthlyTotals.reduce((sum, t) => sum + t, 0) / monthlyTotals.length;
  if (rollingAverage === 0) return currentAmount > 0 ? 100 : 0;
  return Math.round(((currentAmount - rollingAverage) / rollingAverage) * 10000) / 100;
}
