import { groupExpensesByCategory, type SplittableExpense } from './categoryGrouping';

/** Minimal expense shape member grouping needs (no store imports, unit-testable). */
export interface MemberExpense extends SplittableExpense {
  userId?: string | null;
  createdByUserName?: string | null;
}

export interface MemberTotal {
  /** Creator's user id, or `null` when the row carries no creator. */
  userId: string | null;
  name: string | null;
  amount: number;
}

/**
 * Per-creator converted totals. An expense's whole converted amount belongs to
 * its creator — category splits move money between categories, never between
 * people, so they do not change this total.
 */
export function groupExpensesByMember(
  items: MemberExpense[],
  convert: (amount: number, currencyCode: string) => number,
): MemberTotal[] {
  const map = new Map<string | null, MemberTotal>();
  for (const e of items) {
    const key = e.userId ?? null;
    const row = map.get(key) ?? { userId: key, name: null, amount: 0 };
    row.amount += convert(e.amount, e.currencyCode);
    if (!row.name && e.createdByUserName) row.name = e.createdByUserName;
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

/**
 * One member's spend per category, through the same split-aware rule as the
 * category breakdown (`groupExpensesByCategory`) so a split receipt counts each
 * split in its own category.
 */
export function memberCategoryBreakdown(
  items: MemberExpense[],
  userId: string | null,
  convert: (amount: number, currencyCode: string) => number,
): Map<string | null, number> {
  return groupExpensesByCategory(
    items.filter((e) => (e.userId ?? null) === userId),
    convert,
  );
}
