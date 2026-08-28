/**
 * Which categories an expense contributes to, and how much to each.
 *
 * A receipt scanned into several categories keeps ONE `categoryId` of its own
 * and carries the real breakdown in `expense_category_splits`. Any surface that
 * answers "how much did I spend on X" must read that breakdown, or a category
 * that exists only as a split — deposits, alcohol, household — reads as zero
 * while the Analytics tab shows a number for the same period. That
 * contradiction is what this exists to prevent: it is the one place the rule
 * lives, shared by `get_expenses` and `get_category_breakdown` so they cannot
 * drift apart.
 *
 * The rule is single and deliberate: when an expense has splits, the SPLITS
 * decide and its own `categoryId` is ignored; when it has none, its own
 * category takes the whole amount. It mirrors `analytics.service.ts:218`.
 *
 * Budgets, `get_budget_status` and Safe-to-Spend stay split-blind on purpose
 * (design spec, locked decision 1) — do not wire this into them.
 */

export interface AttributableExpense {
  amount: unknown;
  category?: { id?: string; name?: string } | null;
  categorySplits?: Array<{
    categoryId?: string | null;
    amount: unknown;
    category?: { id?: string; name?: string } | null;
  }> | null;
}

export interface CategoryAttribution {
  categoryId?: string;
  categoryName: string;
  /** In the expense's OWN currency — conversion is the caller's job. */
  amount: number;
}

export function attributeToCategories(expense: AttributableExpense): CategoryAttribution[] {
  const splits = Array.isArray(expense.categorySplits) ? expense.categorySplits : [];

  if (splits.length > 0) {
    return splits.map((split) => ({
      categoryId: split.categoryId ?? split.category?.id,
      categoryName: split.category?.name || 'Uncategorized',
      amount: Number(split.amount) || 0,
    }));
  }

  return [
    {
      categoryId: expense.category?.id,
      categoryName: expense.category?.name || 'Uncategorized',
      amount: Number(expense.amount) || 0,
    },
  ];
}
