import type { CommunityPriceStore } from '@budget/shared-types';

// Default k-anonymity threshold: a (product, store, region, week) price point is
// only ever exposed when at least this many DISTINCT accounts contributed it.
// Tunable later via system_config (M2+ read-path concern).
export const DEFAULT_K_ANONYMITY = 5;

/**
 * One anonymized observation row, already filtered by the service to a single
 * product + region + period window. Carries NO PII — merchant/price/currency and
 * the one-way contributorKey used only to count distinct accounts for the K-gate.
 */
export interface CommunityObservationRow {
  merchantNormalized: string;
  price: number;
  currencyCode: string;
  contributorKey: string;
  // Monday-of-week key ('YYYY-MM-DD') — used only for the multi-week persistence
  // gate. Optional: when absent, every row counts as the same single week (so the
  // persistence gate at minWeeks=1 is a no-op — backward-compatible).
  weekStart?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Majority currency by row count (deterministic tie-break by ISO code). */
function majorityCurrency(rows: CommunityObservationRow[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.currencyCode, (counts.get(r.currencyCode) ?? 0) + 1);
  if (counts.size === 0) return '';
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

function medianOf(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Robust outlier filter: drop prices outside [median/2, median*2]. Anti-poisoning
 * — a single fat-fingered or malicious extreme can't drag the displayed median.
 * The median itself is always inside the band, so the result is never empty.
 */
function outlierFilter(prices: number[]): number[] {
  if (prices.length <= 2) return prices;
  const sorted = [...prices].sort((a, b) => a - b);
  const med = medianOf(sorted);
  if (med <= 0) return sorted;
  return sorted.filter((p) => p >= med / 2 && p <= med * 2);
}

/**
 * Aggregate anonymized price observations for ONE product into per-store price
 * points, enforcing k-anonymity. Pure + deterministic (no DB, no clock) so it's
 * unit-testable directly — mirrors computeBasket.
 *
 * - Picks the majority currency and drops rows of any other currency (never mix).
 * - Groups by store; a store is EXPOSED only if it has >= k DISTINCT contributor
 *   keys (accounts). Fewer → dropped entirely (never a single user's price).
 * - Multi-week persistence (anti-Sybil, ABA-335): a store must also have data in
 *   >= minWeeks DISTINCT weeks over the passed (lookback) rows, so a single-week
 *   burst of K throwaway accounts can't surface a store. The displayed median/min
 *   is computed only from rows in the display period (weekStart >= displayFromWeek),
 *   while the K + persistence gates run over ALL passed rows (the lookback window).
 * - Outlier-filters prices, then reports median + min + counts per store.
 * - Marks the cheapest (lowest median) and sorts cheapest-first.
 *
 * Defaults (minWeeks=1, no displayFromWeek) reproduce the pre-persistence behavior.
 */
export function aggregateCommunityPrices(
  rows: CommunityObservationRow[],
  k: number = DEFAULT_K_ANONYMITY,
  minWeeks = 1,
  displayFromWeek?: string,
): { currency: string; stores: CommunityPriceStore[] } {
  if (rows.length === 0) return { currency: '', stores: [] };

  const currency = majorityCurrency(rows);
  const filtered = rows.filter((r) => r.currencyCode === currency);

  const byStore = new Map<string, CommunityObservationRow[]>();
  for (const r of filtered) {
    const arr = byStore.get(r.merchantNormalized) ?? [];
    arr.push(r);
    byStore.set(r.merchantNormalized, arr);
  }

  const stores: CommunityPriceStore[] = [];
  for (const [merchant, group] of byStore.entries()) {
    const distinctContributors = new Set(group.map((g) => g.contributorKey));
    if (distinctContributors.size < k) continue; // k-anonymity gate — never expose

    const distinctWeeks = new Set(group.map((g) => g.weekStart ?? '')).size;
    if (distinctWeeks < minWeeks) continue; // persistence gate — no single-week burst

    // Displayed price comes from the requested period only; the gates above used
    // the full lookback window.
    const displayGroup = displayFromWeek
      ? group.filter((g) => (g.weekStart ?? '') >= displayFromWeek)
      : group;
    const prices = outlierFilter(displayGroup.map((g) => g.price)).sort((a, b) => a - b);
    if (prices.length === 0) continue; // established store but no price in the display period

    stores.push({
      merchantName: titleCase(merchant),
      medianPrice: round2(medianOf(prices)),
      minPrice: round2(prices[0]),
      receiptCount: displayGroup.length,
      contributorCount: distinctContributors.size,
      currencyCode: currency,
      isCheapest: false,
    });
  }

  stores.sort((a, b) => a.medianPrice - b.medianPrice || b.contributorCount - a.contributorCount);
  if (stores.length > 0) stores[0].isCheapest = true;

  return { currency, stores };
}

/** Observation row for the map aggregator — same as above plus its region. */
export interface CommunityMapRow extends CommunityObservationRow {
  region: string;
}

export interface CommunityMapAgg {
  merchantNormalized: string; // internal join key to community_store_geo (not exposed to clients)
  merchantName: string;
  region: string;
  medianPrice: number;
  currencyCode: string;
  receiptCount: number;
  isCheapest: boolean;
}

/**
 * Map variant: aggregate per (store, region) instead of collapsing regions, so
 * each surfaced store→region cell can carry its own coordinate. Same k-anonymity
 * gate (a cell is exposed only with >= k distinct contributors), majority
 * currency, outlier filter, and cheapest-marking as aggregateCommunityPrices.
 * Pure + deterministic. The service joins `merchantNormalized`/`region` to the
 * store-geo lookup and drops any cell without a known coordinate.
 */
export function aggregateCommunityMap(
  rows: CommunityMapRow[],
  k: number = DEFAULT_K_ANONYMITY,
  minWeeks = 1,
  displayFromWeek?: string,
): CommunityMapAgg[] {
  if (rows.length === 0) return [];

  const currency = majorityCurrency(rows);
  const filtered = rows.filter((r) => r.currencyCode === currency);

  const byMerchant = new Map<string, Map<string, CommunityMapRow[]>>();
  for (const r of filtered) {
    let regions = byMerchant.get(r.merchantNormalized);
    if (!regions) {
      regions = new Map();
      byMerchant.set(r.merchantNormalized, regions);
    }
    const arr = regions.get(r.region) ?? [];
    arr.push(r);
    regions.set(r.region, arr);
  }

  const out: CommunityMapAgg[] = [];
  for (const [merchant, regions] of byMerchant) {
    for (const [region, group] of regions) {
      const distinctContributors = new Set(group.map((g) => g.contributorKey));
      if (distinctContributors.size < k) continue; // k-anonymity gate per (store, region)
      const distinctWeeks = new Set(group.map((g) => g.weekStart ?? '')).size;
      if (distinctWeeks < minWeeks) continue; // persistence gate — no single-week burst
      const displayGroup = displayFromWeek
        ? group.filter((g) => (g.weekStart ?? '') >= displayFromWeek)
        : group;
      const prices = outlierFilter(displayGroup.map((g) => g.price)).sort((a, b) => a - b);
      if (prices.length === 0) continue;
      out.push({
        merchantNormalized: merchant,
        merchantName: titleCase(merchant),
        region,
        medianPrice: round2(medianOf(prices)),
        currencyCode: currency,
        receiptCount: displayGroup.length,
        isCheapest: false,
      });
    }
  }

  out.sort((a, b) => a.medianPrice - b.medianPrice);
  if (out.length > 0) out[0].isCheapest = true;
  return out;
}
