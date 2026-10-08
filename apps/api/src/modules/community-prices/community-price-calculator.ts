import type { CommunityPriceStore } from '@budget/shared-types';

// Default k-anonymity threshold: a (product, store, region) cell is only exposed
// when at least this many DISTINCT clusters (people, after correlation merging)
// have a price inside the DISPLAY window.
export const DEFAULT_K_ANONYMITY = 5;
/** At least this many of those clusters must be trusted (ABA-642 D3). */
export const DEFAULT_MIN_TRUSTED = 2;
/** A store may carry the cheapest badge only if it did not just drop by this much (D6.4). */
export const DEFAULT_CHEAPEST_MAX_DROP_PCT = 30;
/** Prior-period median needs at least this many clusters to be a usable reference. */
const MIN_PRIOR_CLUSTERS = 3;
/** Modified z-score cut-off (Iglewicz-Hoaglin) and the MAD floor, as a share of the median. */
const MAD_Z = 3.5;
const MAD_FLOOR_SHARE = 0.05;
/** Contributor-count display buckets: floor of the exact cluster count. */
const COUNT_BUCKETS = [50, 20, 10, 5];
/** One cluster may add at most this many rows to a cell's published receipt count. */
const MAX_ROWS_PER_CLUSTER = 3;

/**
 * One anonymized observation row, already filtered by the service to a single
 * product (+ region) and the attested, current-schema rows only. Carries NO PII —
 * merchant/price/currency, the one-way contributorKey used only to count distinct
 * people, and the coarse `trusted` boolean computed at contribution time.
 */
export interface CommunityObservationRow {
  merchantNormalized: string;
  price: number;
  currencyCode: string;
  contributorKey: string;
  /** Monday-of-week key ('YYYY-MM-DD'). Absent = every row is the same single week. */
  weekStart?: string;
  /**
   * Monday of the week the row was CONTRIBUTED (ingested), not of the receipt date.
   * Persistence is measured on this, so a burst of back-dated receipts written in one
   * sitting cannot pose as two weeks of history. Absent = falls back to `weekStart`.
   */
  ingestWeek?: string;
  /** Trusted at contribution time (tenure >= 60 d or Stripe-paid). Absent = false. */
  trusted?: boolean;
}

export interface CommunityAggOptions {
  k: number;
  /** Min trusted clusters per exposed cell. 0 disables gate (b). */
  minTrusted: number;
  /**
   * Min distinct INGEST weeks in the passed (lookback) rows. 1 = no persistence gate.
   * With minWeeks >= 2 the rows must also come from >= 2 distinct clusters, so one
   * actor cannot supply "persistence" alone.
   */
  minWeeks: number;
  /** Rows with weekStart < this are "prior" (outside the display window). */
  displayFromWeek?: string;
  /** contributorKey -> clusterId; null/undefined = every contributor is its own cluster. */
  clusterMap?: Map<string, string> | null;
  /** Cheapest-badge stability threshold (percent). 0 disables it. */
  cheapestMaxDropPct: number;
}

export const DEFAULT_AGG_OPTIONS: CommunityAggOptions = {
  k: DEFAULT_K_ANONYMITY,
  minTrusted: DEFAULT_MIN_TRUSTED,
  minWeeks: 1,
  cheapestMaxDropPct: DEFAULT_CHEAPEST_MAX_DROP_PCT,
};

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
function majorityCurrency(rows: Array<{ currencyCode: string }>): string {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.currencyCode, (counts.get(r.currencyCode) ?? 0) + 1);
  if (counts.size === 0) return '';
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Floor of the exact count to one of {5, 10, 20, 50}; below 5 the count is returned as-is. */
export function bucketContributorCount(n: number): number {
  for (const b of COUNT_BUCKETS) if (n >= b) return b;
  return n;
}

interface ClusterValue {
  clusterId: string;
  price: number;
  trusted: boolean;
  rows: number;
}

/**
 * One value per cluster: the median of that cluster's rows. A ring that survived
 * clustering still gets one vote per member, and a member's several weekly rows
 * are one vote, not several.
 */
function clusterValues(
  rows: CommunityObservationRow[],
  clusterMap: Map<string, string> | null | undefined,
): ClusterValue[] {
  const byCluster = new Map<string, CommunityObservationRow[]>();
  for (const r of rows) {
    const id = clusterMap?.get(r.contributorKey) ?? r.contributorKey;
    const arr = byCluster.get(id) ?? [];
    arr.push(r);
    byCluster.set(id, arr);
  }
  return [...byCluster.entries()].map(([clusterId, rs]) => ({
    clusterId,
    price: medianOf(rs.map((r) => r.price)),
    trusted: rs.some((r) => r.trusted === true),
    rows: rs.length,
  }));
}

/**
 * Modified z-score filter against the cell's OWN data. Drops a cluster value p
 * when |p - med| > 3.5 * 1.4826 * max(MAD, 5% * med). The floor stops a store
 * with a perfectly stable price (MAD = 0) from rejecting a legitimate one-cent
 * change. Never empties the set: the median itself always survives.
 */
function madFilter(values: ClusterValue[]): ClusterValue[] {
  if (values.length < 3) return values;
  const prices = values.map((v) => v.price);
  const med = medianOf(prices);
  if (med <= 0) return values;
  const mad = medianOf(prices.map((p) => Math.abs(p - med)));
  const limit = MAD_Z * 1.4826 * Math.max(mad, MAD_FLOOR_SHARE * med);
  return values.filter((v) => Math.abs(v.price - med) <= limit);
}

export interface CellResult {
  medianPrice: number;
  /**
   * Rows (receipts) behind the surviving cluster values, in the display window, each
   * cluster's share capped at MAX_ROWS_PER_CLUSTER. EXACT and INTERNAL — it is only
   * ever published through `bucketContributorCount`.
   */
  receiptCount: number;
  /** Exact surviving cluster count — INTERNAL, only ever shown through the bucket. */
  clusterCount: number;
  /** False after a sudden drop vs. the prior period; the price still shows, the badge does not. */
  badgeEligible: boolean;
}

/**
 * Evaluate ONE cell (one store, or one store x region) of ONE product, all rows
 * already in the majority currency. Returns null unless every exposure gate holds:
 *   (a) >= k distinct clusters with a price INSIDE the display window, counted
 *       after the MAD filter — the number shown is backed by at least k;
 *   (b) >= minTrusted of those clusters are trusted;
 *   (c) data in >= minWeeks distinct weeks over the lookback rows passed in.
 * Pure + deterministic (no DB, no clock).
 */
export function evaluateCommunityCell(
  group: CommunityObservationRow[],
  opts: CommunityAggOptions,
): CellResult | null {
  // Persistence gate — no single-week burst, and not one actor's solo history: the
  // distinct ingest weeks must be backed by >= 2 distinct clusters (when minWeeks >= 2).
  const distinctWeeks = new Set(group.map((g) => g.ingestWeek ?? g.weekStart ?? '')).size;
  if (distinctWeeks < opts.minWeeks) return null;
  if (opts.minWeeks >= 2) {
    const clusters = new Set(group.map((g) => opts.clusterMap?.get(g.contributorKey) ?? g.contributorKey));
    if (clusters.size < 2) return null;
  }

  const inWindow = opts.displayFromWeek
    ? group.filter((g) => (g.weekStart ?? '') >= opts.displayFromWeek!)
    : group;
  const survivors = madFilter(clusterValues(inWindow, opts.clusterMap));
  if (survivors.length < opts.k) return null; // k-anonymity over the DISPLAYED data
  if (survivors.filter((v) => v.trusted).length < opts.minTrusted) return null;

  const medianPrice = round2(medianOf(survivors.map((v) => v.price)));

  // Cheapest-badge stability: compare with the same store's own earlier weeks.
  let badgeEligible = true;
  if (opts.displayFromWeek && opts.cheapestMaxDropPct > 0) {
    const prior = group.filter((g) => (g.weekStart ?? '') < opts.displayFromWeek!);
    const priorValues = madFilter(clusterValues(prior, opts.clusterMap));
    if (priorValues.length >= MIN_PRIOR_CLUSTERS) {
      const priorMedian = medianOf(priorValues.map((v) => v.price));
      badgeEligible = medianPrice >= (1 - opts.cheapestMaxDropPct / 100) * priorMedian;
    }
  }

  return {
    medianPrice,
    receiptCount: survivors.reduce((s, v) => s + Math.min(v.rows, MAX_ROWS_PER_CLUSTER), 0),
    clusterCount: survivors.length,
    badgeEligible,
  };
}

/**
 * Aggregate anonymized observations for ONE product into per-store price points.
 * Picks the majority currency, groups by store, and exposes a store only through
 * `evaluateCommunityCell`. Cheapest-first; the cheapest store (lowest median)
 * carries `isCheapest` only when it passed the badge-stability rule — if it did
 * not, nobody is badged rather than crowning a runner-up. No `minPrice`: that was
 * a single contributor's exact value. `contributorCount` is bucketed.
 */
export function aggregateCommunityPrices(
  rows: CommunityObservationRow[],
  options: Partial<CommunityAggOptions> = {},
): { currency: string; stores: CommunityPriceStore[] } {
  if (rows.length === 0) return { currency: '', stores: [] };
  const opts: CommunityAggOptions = { ...DEFAULT_AGG_OPTIONS, ...options };

  const currency = majorityCurrency(rows);
  const byStore = new Map<string, CommunityObservationRow[]>();
  for (const r of rows) {
    if (r.currencyCode !== currency) continue;
    const arr = byStore.get(r.merchantNormalized) ?? [];
    arr.push(r);
    byStore.set(r.merchantNormalized, arr);
  }

  const evaluated: Array<{ store: CommunityPriceStore; badgeEligible: boolean }> = [];
  for (const [merchant, group] of byStore.entries()) {
    const cell = evaluateCommunityCell(group, opts);
    if (!cell) continue;
    evaluated.push({
      badgeEligible: cell.badgeEligible,
      store: {
        merchantName: titleCase(merchant),
        medianPrice: cell.medianPrice,
        receiptCount: bucketContributorCount(cell.receiptCount),
        contributorCount: bucketContributorCount(cell.clusterCount),
        currencyCode: currency,
        isCheapest: false,
      },
    });
  }

  evaluated.sort(
    (a, b) => a.store.medianPrice - b.store.medianPrice || b.store.contributorCount - a.store.contributorCount,
  );
  if (evaluated.length > 0 && evaluated[0].badgeEligible) evaluated[0].store.isCheapest = true;

  return { currency, stores: evaluated.map((e) => e.store) };
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
  /** Bucketed like contributorCount (never the exact figure). */
  receiptCount: number;
  /** INTERNAL: whether this cell may carry the cheapest badge (see aggregateCommunityPrices). */
  badgeEligible: boolean;
}

/**
 * Map variant: aggregate per (store, region) so each surfaced cell can carry its
 * own coordinate. Same gates as `aggregateCommunityPrices`. The service joins
 * `merchantNormalized`/`region` to the store-geo lookup, drops any cell without a
 * known coordinate and then marks the cheapest among what remains.
 */
export function aggregateCommunityMap(
  rows: CommunityMapRow[],
  options: Partial<CommunityAggOptions> = {},
): CommunityMapAgg[] {
  if (rows.length === 0) return [];
  const opts: CommunityAggOptions = { ...DEFAULT_AGG_OPTIONS, ...options };

  const currency = majorityCurrency(rows);
  const byMerchant = new Map<string, Map<string, CommunityMapRow[]>>();
  for (const r of rows) {
    if (r.currencyCode !== currency) continue;
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
      const cell = evaluateCommunityCell(group, opts);
      if (!cell) continue;
      out.push({
        merchantNormalized: merchant,
        merchantName: titleCase(merchant),
        region,
        medianPrice: cell.medianPrice,
        currencyCode: currency,
        receiptCount: bucketContributorCount(cell.receiptCount),
        badgeEligible: cell.badgeEligible,
      });
    }
  }

  out.sort((a, b) => a.medianPrice - b.medianPrice);
  return out;
}
