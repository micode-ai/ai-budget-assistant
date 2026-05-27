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

/**
 * Distinct merchants with their expense counts (exact, case-sensitive, trimmed value).
 * Variants stay separate on purpose — the management screen exists to collapse them.
 * Skips soft-deleted rows and blank merchants. Sorted by count desc, then name.
 */
export function getMerchantCounts(expenses: Expense[]): { merchant: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of expenses) {
    if (e.isDeleted) continue;
    const name = e.merchant;
    if (!name?.trim()) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([merchant, count]) => ({ merchant, count }))
    .sort((a, b) => b.count - a.count || a.merchant.localeCompare(b.merchant));
}

/**
 * If `input` matches an existing merchant case-insensitively (trimmed), return that
 * existing canonical value; otherwise the trimmed input. '' for blank/nullish input.
 * Used at capture time (OCR/voice) so new expenses reuse existing merchant names.
 */
export function resolveExistingMerchant(input: string | null | undefined, existing: string[]): string {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  const match = existing.find((m) => m.trim().toLowerCase() === lower);
  return match ?? trimmed;
}
