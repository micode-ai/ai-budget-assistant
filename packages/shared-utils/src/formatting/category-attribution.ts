/**
 * Which categories an expense contributes to, and how much to each.
 *
 * MIRROR of `apps/api/src/common/utils/category-attribution.ts`. The API has no
 * build step for workspace packages and must not runtime-import this package
 * (`scripts/check-no-shared-utils-runtime-import.sh`), so the rule is
 * deliberately duplicated rather than shared. Same convention and same reason
 * as `financial-month.ts`, `wallet-currencies.ts` and `budget-projection.ts`.
 * Change one, change the other — the parity test in
 * `apps/api/src/common/utils/category-attribution.spec.ts` fails otherwise.
 *
 * The rule: when an expense has live splits, the SPLITS decide and its own
 * `categoryId` is ignored; when it has none, its own category takes the whole
 * amount. Consumed here by `budgetStore.getBudgetProgress`, which computes
 * every budget number the user sees on screen.
 */

export interface AttributableSplit {
  categoryId?: string | null;
  amount: unknown;
  /** Absent on already-filtered Prisma includes; present on mobile rows. */
  isDeleted?: boolean;
  category?: { id?: string; name?: string } | null;
}

export interface AttributableExpense {
  amount: unknown;
  /**
   * The scalar FK, preferred over `category.id`. Budgets need only the id and
   * have no reason to join the category table for it.
   */
  categoryId?: string | null;
  category?: { id?: string; name?: string } | null;
  /** Prisma's relation name. */
  categorySplits?: AttributableSplit[] | null;
  /** The mobile entity's field name for the same thing. */
  splits?: AttributableSplit[] | null;
}

export interface CategoryAttribution {
  categoryId?: string;
  categoryName: string;
  /** In the expense's OWN currency — conversion is the caller's job. */
  amount: number;
}

function liveSplits(expense: AttributableExpense): AttributableSplit[] {
  const raw = expense.categorySplits ?? expense.splits;
  if (!Array.isArray(raw)) return [];
  return raw.filter((split) => split.isDeleted !== true);
}

export function attributeToCategories(expense: AttributableExpense): CategoryAttribution[] {
  const splits = liveSplits(expense);

  if (splits.length > 0) {
    return splits.map((split) => ({
      categoryId: split.categoryId ?? split.category?.id,
      categoryName: split.category?.name || 'Uncategorized',
      amount: Number(split.amount) || 0,
    }));
  }

  return [
    {
      categoryId: expense.categoryId ?? expense.category?.id,
      categoryName: expense.category?.name || 'Uncategorized',
      amount: Number(expense.amount) || 0,
    },
  ];
}

/**
 * How much of one expense belongs to a given set of categories.
 *
 * This is what a category-scoped budget spends against. An empty set returns 0
 * rather than the whole amount: a budget with no allocations is not
 * category-scoped at all and must not reach this function — its caller keeps
 * the cheaper unfiltered aggregate.
 */
export function attributableAmountForCategories(
  expense: AttributableExpense,
  categoryIds: ReadonlySet<string>,
): number {
  if (categoryIds.size === 0) return 0;

  let total = 0;
  for (const part of attributeToCategories(expense)) {
    if (part.categoryId && categoryIds.has(part.categoryId)) total += part.amount;
  }
  return total;
}
