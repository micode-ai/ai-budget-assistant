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
