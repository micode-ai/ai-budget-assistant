import type { BudgetCategoryProgress } from '@budget/shared-types';

export interface SubcategoryBreakdownRow {
  key: string;
  /** null = the "without subcategory" row (label comes from i18n). */
  name: string | null;
  color?: string;
  spent: number;
}

/**
 * Rows shown under a budget line's sum: one per spending child, then a final
 * "without subcategory" row for the parent's own spend when it is > 0.
 * Empty when the line has no children, so accounts without subcategories
 * render exactly as before.
 */
export function buildSubcategoryRows(
  cat: Pick<BudgetCategoryProgress, 'subcategories' | 'ownSpent'>,
): SubcategoryBreakdownRow[] {
  const subs = cat.subcategories ?? [];
  if (subs.length === 0) return [];
  const rows: SubcategoryBreakdownRow[] = subs.map((s) => ({
    key: s.categoryId,
    name: s.categoryName,
    color: s.categoryColor,
    spent: s.spent,
  }));
  if ((cat.ownSpent ?? 0) > 0) {
    rows.push({ key: '__own__', name: null, spent: cat.ownSpent as number });
  }
  return rows;
}
