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

export interface MerchantGroup {
  /** Brand fingerprint key (uppercase). */
  fingerprint: string;
  /** Suggested canonical name (title-cased brand). User can edit before merging. */
  canonical: string;
  /** Variant names in the group, highest-count first. */
  members: string[];
  /** Sum of expense counts across members. */
  totalCount: number;
}

/**
 * Generic words that must NOT become a brand fingerprint: venue/category nouns,
 * legal forms, and common Polish cities. Without this, names like
 * "Restauracja IKEA" / "Restauracja McDonald's" would both key on RESTAURACJA
 * (and merge into one), and "... GDANSK" rows would group by city. Uppercase,
 * diacritics included (matched after `toUpperCase()`).
 */
const FINGERPRINT_STOPWORDS = new Set<string>([
  // venue / category nouns (PL + EN)
  'RESTAURACJA', 'RESTAURANT', 'APTEKA', 'SKLEP', 'MARKET', 'SUPERMARKET',
  'STACJA', 'HOTEL', 'KAWIARNIA', 'PIEKARNIA', 'CUKIERNIA', 'PARKING',
  'STORE', 'SHOP', 'MARKT', 'FORUM', 'CENTRUM', 'GALERIA', 'POZIOM',
  // legal forms / operators
  'SPÓŁKA', 'SPOLKA', 'POLSKA', 'POLAND', 'GROUP', 'GRUPA', 'HANDLOWA', 'SIEĆ', 'SIEC',
  // common PL cities / districts
  'WARSZAWA', 'KRAKÓW', 'KRAKOW', 'GDAŃSK', 'GDANSK', 'WROCŁAW', 'WROCLAW',
  'POZNAŃ', 'POZNAN', 'ŁÓDŹ', 'LODZ', 'SZCZECIN', 'LUBLIN', 'KATOWICE',
  'GDYNIA', 'OLIWA', 'BYDGOSZCZ', 'BIAŁYSTOK', 'BIALYSTOK',
]);

/**
 * Brand key for fuzzy grouping: the first alphabetic token of length >= 4 that
 * is not a generic stopword (see FINGERPRINT_STOPWORDS), uppercased. Strips
 * store numbers and short noise tokens. Returns '' when no distinctive token
 * exists. Intentionally coarse — it powers suggestions the user confirms, never
 * an automatic merge, so some over-grouping is acceptable.
 */
export function merchantFingerprint(name: string): string {
  const tokens = name
    .toUpperCase()
    .split(/[^A-ZÀ-ÿĄĆĘŁŃÓŚŹŻ]+/i)
    .filter(Boolean);
  return tokens.find((t) => t.length >= 4 && !FINGERPRINT_STOPWORDS.has(t)) ?? '';
}

const titleCaseBrand = (fp: string): string =>
  fp.charAt(0).toUpperCase() + fp.slice(1).toLowerCase();

/**
 * Group merchant variants that share a fingerprint, returning only groups with
 * >=2 members (something to merge). Each group suggests a title-cased canonical
 * name; members are sorted by count desc. Groups sorted by total count desc.
 */
export function suggestMerchantGroups(
  merchants: { merchant: string; count: number }[],
): MerchantGroup[] {
  const buckets = new Map<string, { merchant: string; count: number }[]>();
  for (const m of merchants) {
    const fp = merchantFingerprint(m.merchant);
    if (!fp) continue;
    const arr = buckets.get(fp) ?? [];
    arr.push(m);
    buckets.set(fp, arr);
  }
  const groups: MerchantGroup[] = [];
  for (const [fp, members] of buckets) {
    if (members.length < 2) continue;
    const sorted = [...members].sort(
      (a, b) => b.count - a.count || a.merchant.localeCompare(b.merchant),
    );
    groups.push({
      fingerprint: fp,
      canonical: titleCaseBrand(fp),
      members: sorted.map((s) => s.merchant),
      totalCount: sorted.reduce((s, x) => s + x.count, 0),
    });
  }
  return groups.sort((a, b) => b.totalCount - a.totalCount);
}
