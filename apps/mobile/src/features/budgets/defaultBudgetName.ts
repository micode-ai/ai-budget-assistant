import type { BudgetPeriod } from '@budget/shared-types';

/**
 * The name a new budget gets when the user leaves the name field empty (ABA-732).
 *
 * The name used to be required, and it was the field people skipped: they typed an
 * amount, picked a category, pressed Create and got an error. A budget about one
 * category is named after it; anything else after its period ("Monthly Budget").
 * The form shows this value as the field's placeholder, so what gets saved is
 * exactly what was on screen.
 */
export interface DefaultBudgetNameInput {
  /** What the user typed; wins whenever it is non-blank. */
  typed: string;
  mode: 'overall' | 'byCategory';
  period: BudgetPeriod;
  /** Category picked in `overall` mode ('' when none). */
  selectedCategoryId: string;
  /** Category ids of the allocations in `byCategory` mode. */
  allocationCategoryIds: string[];
  /** Display name of a category, or undefined if it is not loaded. */
  categoryName: (id: string) => string | undefined;
  /** Localized "<Period> Budget". */
  periodName: (period: BudgetPeriod) => string;
}

export function resolveBudgetName(input: DefaultBudgetNameInput): string {
  const typed = input.typed.trim();
  if (typed) return typed;

  const categoryId =
    input.mode === 'byCategory'
      ? input.allocationCategoryIds.length === 1
        ? input.allocationCategoryIds[0]
        : null
      : input.selectedCategoryId || null;

  const fromCategory = categoryId ? input.categoryName(categoryId)?.trim() : undefined;
  return fromCategory || input.periodName(input.period);
}
