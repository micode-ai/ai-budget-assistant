import { rollUpCategoryTotals } from './categoryRollup';

export interface YearOverYearRow {
  categoryId: string | null;
  current: number;
  lastYear: number;
  /** Percent change against last year; null when last year had nothing to compare with. */
  change: number | null;
}

/**
 * Top-level categories this period against the same period a year earlier
 * (ABA-797), rolled up to parents with the same rule as the donut. A category
 * spent on only last year is kept with a zero current amount — "stopped" is as
 * much an answer as "grew". Sorted by the larger of the two amounts.
 */
export function buildYearOverYearRows(
  current: Map<string | null, number>,
  lastYear: Map<string | null, number>,
  parentOf: (categoryId: string) => string | null,
): YearOverYearRow[] {
  const union = new Map(current);
  for (const key of lastYear.keys()) if (!union.has(key)) union.set(key, 0);
  return rollUpCategoryTotals(union, [lastYear], parentOf)
    .map((node) => {
      const prev = node.trailing[0] ?? 0;
      return {
        categoryId: node.categoryId,
        current: node.amount,
        lastYear: prev,
        change: prev > 0 ? Math.round(((node.amount - prev) / prev) * 1000) / 10 : null,
      };
    })
    .filter((r) => r.current > 0 || r.lastYear > 0)
    .sort((a, b) => Math.max(b.current, b.lastYear) - Math.max(a.current, a.lastYear));
}
