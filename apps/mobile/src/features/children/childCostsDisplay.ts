import type { Category, ChildCostSummary } from '@budget/shared-types';
import { categoryLabel } from '@/utils/entityLabel';

/** A category row of one child's breakdown (shares are of that child's own year total). */
export interface ChildCategoryRow {
  id: string;
  name: string;
  amount: number;
  percentage: number;
  color?: string;
}

/** Nothing attributed to this child at all: tiles show a dash, the bars an empty note. */
export function isEmptySummary(summary: ChildCostSummary): boolean {
  return (
    summary.monthTotal === 0 &&
    summary.yearTotal === 0 &&
    summary.averagePerMonth === 0 &&
    summary.months.every((m) => m.amount === 0)
  );
}

/** `byCategory` with display names (the one category display rule) and shares of the child's year. */
export function childCategoryRows(summary: ChildCostSummary, categories: Category[]): ChildCategoryRow[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const total = summary.byCategory.reduce((s, r) => s + r.amount, 0);
  return summary.byCategory
    .filter((r) => r.amount > 0)
    .map((r, index) => {
      const category = r.categoryId ? byId.get(r.categoryId) : undefined;
      return {
        id: r.categoryId ?? `uncategorized-${index}`,
        name: categoryLabel(category ?? null),
        amount: r.amount,
        percentage: total > 0 ? (r.amount / total) * 100 : 0,
        color: category?.color,
      };
    });
}

/** `YYYY-MM` -> a short month label ("Mar"), and a long one for screen readers ("March 2026"). */
export function monthLabels(month: string, locale: string): { short: string; long: string } {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, 1);
  return {
    short: new Intl.DateTimeFormat(locale, { month: 'short' }).format(date),
    long: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date),
  };
}
