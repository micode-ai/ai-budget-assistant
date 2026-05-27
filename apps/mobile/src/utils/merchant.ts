import type { Expense } from '@budget/shared-types';

/**
 * Distinct, non-empty merchant names across the given expenses.
 * De-duplicated case-insensitively (first-seen casing wins), excludes
 * soft-deleted rows, sorted with locale-aware compare. Used for the
 * merchant filter picker and the manual-entry autocomplete suggestions.
 */
export function getDistinctMerchants(expenses: Expense[]): string[] {
  const seen = new Map<string, string>();
  for (const e of expenses) {
    if (e.isDeleted) continue;
    const m = e.merchant?.trim();
    if (!m) continue;
    const key = m.toLowerCase();
    if (!seen.has(key)) seen.set(key, m);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}
