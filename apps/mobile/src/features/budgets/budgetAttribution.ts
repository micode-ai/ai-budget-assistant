import { attributeToCategories } from '@budget/shared-utils';

/**
 * How much of a period's expenses belongs to one budget, split-aware.
 *
 * An expense whose OWN category is outside the budget can still hold a split
 * into it, and one whose own category is inside can hold most of its money
 * elsewhere. Filtering the list by `categoryId` — what `getBudgetProgress` did
 * before — gets both wrong, in opposite directions. See
 * docs/superpowers/specs/2026-09-10-budget-split-attribution-design.md.
 *
 * Lives here rather than in the store because the store reaches into four
 * other stores through `.getState()`, and this arithmetic deserves a test that
 * is not mostly mock scaffolding.
 */

export interface BudgetAttributableExpense {
  id: string;
  date: Date | string;
  amount: number;
  categoryId?: string | null;
  splits?: Array<{ categoryId: string; amount: number; isDeleted?: boolean }>;
}

export interface BudgetSpendAttribution {
  /** Total attributable to the budget. */
  spent: number;
  /** categoryId -> attributed amount. Empty for an overall budget. */
  byCategory: Map<string, number>;
  /** Day key -> attributed amount, for the projection's rate. */
  byDay: Map<string, number>;
}

/**
 * @param categoryIds the budget's allocated categories, or `null` for an
 *   overall budget, which covers everything and needs no attribution at all —
 *   the live splits of an expense sum to its amount.
 */
export function attributeBudgetSpend(
  expenses: readonly BudgetAttributableExpense[],
  categoryIds: ReadonlySet<string> | null,
): BudgetSpendAttribution {
  const byCategory = new Map<string, number>();
  const byDay = new Map<string, number>();
  let spent = 0;

  for (const expense of expenses) {
    let attributed = 0;

    if (!categoryIds) {
      attributed = expense.amount;
    } else {
      for (const part of attributeToCategories(expense)) {
        if (!part.categoryId || !categoryIds.has(part.categoryId)) continue;
        attributed += part.amount;
        byCategory.set(part.categoryId, (byCategory.get(part.categoryId) ?? 0) + part.amount);
      }
    }

    if (attributed === 0) continue;
    spent += attributed;
    // The same key the store used before, so the projection's day bucketing is
    // unchanged — only the money in each bucket is now the budget's own share.
    const dayKey = new Date(expense.date).toDateString();
    byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + attributed);
  }

  return { spent, byCategory, byDay };
}
