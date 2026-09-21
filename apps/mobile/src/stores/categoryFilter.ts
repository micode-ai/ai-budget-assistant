/**
 * Sentinel category id meaning "show only rows with no category at all".
 *
 * It lives in its own module rather than on one of the stores because BOTH the
 * expense and the income list filter by it, and importing `expenseStore` into
 * `incomeStore` just to reach a string would drag a store with module-level
 * subscriptions into the other's import graph.
 *
 * It is deliberately a value no real id can collide with: category ids are
 * UUIDs or `default-…` seeds, never a double-underscored word.
 */
export const UNCATEGORIZED_CATEGORY_FILTER = '__uncategorized__';

/**
 * What the category store must tell the filter for it to judge a row.
 *
 * Passed in rather than read here so this module stays a leaf: `expenseStore`
 * and `incomeStore` both already hold a `useCategoryStore` reference, and a
 * third import edge from a constants file is not worth it.
 */
export interface CategoryResolution {
  isInitialized: boolean;
  hasCategories: boolean;
  resolve: (id: string) => unknown;
}

/**
 * Whether a row belongs under the picker's "without category" option.
 *
 * Two cases count, deliberately — because the UI already treats them as one.
 * `ExpenseDetailsCard` renders `common.uncategorized` both for a row with no
 * category AND for a `categoryId` it cannot resolve, so matching only the
 * first left rows that visibly say "Bez kategorii" unreachable from the filter
 * named after that label (ABA-575).
 *
 * The two guards matter as much as the rule: an id that resolves to nothing is
 * evidence of a diverged category only once the account's categories are
 * actually known. While the store is still loading — or when it loaded an
 * empty list, which on web is the ABA-519 failure shape — every row in the app
 * would otherwise qualify, and the filter would answer a fully-categorized
 * ledger with "all of it is uncategorized". Failing to the old, narrower
 * behaviour there is the safe direction.
 */
export function countsAsUncategorized(
  categoryId: string | null | undefined,
  categories: CategoryResolution,
): boolean {
  if (!categoryId) return true;
  if (!categories.isInitialized || !categories.hasCategories) return false;
  return categories.resolve(categoryId) == null;
}
