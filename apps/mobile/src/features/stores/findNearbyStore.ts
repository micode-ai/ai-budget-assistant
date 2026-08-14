import type { ExpenseSource } from '@budget/shared-types';

export interface StoreVisit {
  merchant: string;
  lat: number;
  lng: number;
  /** Where the expense came from — see `TRUSTED_VISIT_SOURCES`. */
  source: ExpenseSource;
}

export interface NearbyStore {
  merchant: string;
  distanceM: number;
}

export interface NearbyStoreConfig {
  /** How close counts as "at" the shop. */
  radiusM: number;
  /** Coordinate-bearing visits before a merchant counts as a shop at all. */
  minVisits: number;
}

export const NEARBY_STORE_DEFAULTS: NearbyStoreConfig = { radiusM: 150, minVisits: 2 };

/**
 * The expense sources whose coordinates describe a *shop*, rather than wherever
 * the phone's owner happened to be standing.
 *
 * This filter is not tidiness — without it the feature is simply wrong.
 * `app/expense/new.tsx` and `app/expense/voice.tsx` both fire
 * `captureCurrentLocation()` on form mount and attach the result to the saved
 * expense, so an expense typed on the sofa carries the sofa's GPS under
 * whatever merchant the user typed. Two such evenings clear `minVisits`; the
 * median of two home points is a home point; and because this matcher returns
 * the *nearest* group, a home-centred group sits ~0 m from a user standing at
 * home and therefore beats every legitimately-matched shop in range. For a
 * merchant the user never physically visits — a subscription, an online order —
 * the centre never drifts back, because no competing point-of-sale geotag
 * exists to move it.
 *
 * Trusted:
 * - `ocr` — the store address geocoded off the receipt itself.
 * - `notification` — GPS awaited at the moment the bank push arrives, so the
 *   phone is at the till.
 * - `telegram`, `whatsapp`, `slack` — bot receipt scans. Bots have no device
 *   GPS at all, so their only coordinate is the receipt's geocoded store address.
 *
 * Excluded:
 * - `manual`, `voice` — mount-time device GPS, wherever the user happens to be.
 * - `import` — never carries a location at all.
 *
 * Known residual, accepted rather than closed: `app/expense/receipt.tsx` falls
 * back to device GPS when the scanned receipt has no parseable address, so a
 * no-address receipt scanned at home lands a home coordinate under `ocr`.
 * Requiring `location.name` would close it — but would also discard every
 * `notification` capture, which carries no name and is the most trustworthy
 * source there is. It takes two such receipts for the same merchant at the same
 * place to reach `minVisits`, and that is the accepted trade.
 *
 * Adding a source? Decide deliberately: does its coordinate describe the shop,
 * or the phone's owner? The names do not tell you.
 */
export const TRUSTED_VISIT_SOURCES: ReadonlySet<ExpenseSource> = new Set<ExpenseSource>([
  'ocr',
  'notification',
  'telegram',
  'whatsapp',
  'slack',
]);

const EARTH_RADIUS_M = 6_371_000;
const toRad = (d: number): number => (d * Math.PI) / 180;

/**
 * Great-circle distance in metres.
 *
 * This is a SECOND copy: the existing one is a private, unexported function
 * inside `apps/api/src/modules/price-history/basket-calculator.ts`, and mobile
 * cannot import from the API at all. Extracting it to shared-utils was
 * considered and rejected — the API cannot import runtime values from there
 * (no build step for workspace packages, and a pre-deploy script fails the
 * build over it), so "sharing" would mean the same hand-maintained duplicated
 * pair as `financial-month.ts` for a five-line formula.
 */
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Null island: the zeroed plaintext of an undecryptable tier-2 row, not a place. */
export const isRealPoint = (p: { lat: number; lng: number }): boolean =>
  Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0);

/**
 * The lower-middle order statistic — deliberately NOT the textbook median.
 *
 * Averaging the two middle values makes the median IS the mean at an even
 * count, and the default floor is two: one real point-of-sale geotag plus one
 * stray a kilometre away put the centre 500 m from both, so no card appeared at
 * the actual shop; and a shop 200 m from home — ordinary in a city — put the
 * centre 100 m from each, so the card fired at both. Returning an order
 * statistic keeps the centre on a coordinate some visit actually occupied,
 * rather than a synthetic midpoint no visit ever did.
 *
 * `lat` and `lng` are taken independently, so at an even count they may come
 * from different visits. That is the same marginal-median arrangement the
 * design accepted, and it is still an observed value per axis.
 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** A shop's location: one merchant, one representative coordinate. */
export interface StoreCentre {
  merchant: string;
  lat: number;
  lng: number;
}

/**
 * The user's shops, as coordinates.
 *
 * This is the grouping half of `findNearbyStore`, lifted out so a caller can
 * hold the answer without holding the expenses it came from — Shopping Mode
 * snapshots these into MMKV, where storing raw expense history would be both
 * larger and a worse thing to leave lying on disk.
 *
 * Returned sorted by lowercased merchant name, which is what gives
 * `findNearbyStore` its deterministic tie-break.
 */
export function buildStoreCentres(visits: StoreVisit[], minVisits: number): StoreCentre[] {
  // Group case-insensitively, but keep the first spelling seen for display —
  // "BIEDRONKA" off a bank import and "Biedronka" off a receipt are one shop.
  const groups = new Map<string, { display: string; lats: number[]; lngs: number[] }>();
  for (const v of visits) {
    const name = v.merchant?.trim();
    if (!name || !isRealPoint(v)) continue;
    // A coordinate the user's own phone supplied while they sat at home is not
    // evidence of a shop — see TRUSTED_VISIT_SOURCES.
    if (!TRUSTED_VISIT_SOURCES.has(v.source)) continue;
    const key = name.toLowerCase();
    const group = groups.get(key) ?? { display: name, lats: [], lngs: [] };
    group.lats.push(v.lat);
    group.lngs.push(v.lng);
    groups.set(key, group);
  }

  const centres: StoreCentre[] = [];
  for (const key of Array.from(groups.keys()).sort()) {
    const group = groups.get(key)!;
    if (group.lats.length < minVisits) continue;
    centres.push({ merchant: group.display, lat: median(group.lats), lng: median(group.lngs) });
  }
  return centres;
}

/**
 * The nearest centre within `radiusM`, or null if none qualify.
 *
 * Shared scan logic: both `findNearbyStore` below and the Shopping Mode
 * session reducer (`features/shopping-mode/session.ts`) need "closest
 * in-range centre", and this is the one place that scan lives — the session
 * reducer's spec is explicit that it adds no matching logic of its own.
 *
 * Returns the raw (unrounded) distance. Rounding is a presentation decision
 * for the caller to make at its own return boundary, never before a
 * comparison — see `findNearbyStore`, the only place that rounds.
 */
export function nearestWithin(
  coords: { lat: number; lng: number },
  centres: StoreCentre[],
  radiusM: number
): { merchant: string; distanceM: number } | null {
  let best: { merchant: string; distanceM: number } | null = null;
  // Callers are expected to pass centres name-sorted (see `buildStoreCentres`)
  // so that an exact distance tie resolves by name rather than by array
  // order — this function receives `centres` as a plain parameter and has no
  // way to enforce that itself; it is the caller's guarantee, not a fact this
  // function can rely on independently.
  for (const centre of centres) {
    const distanceM = haversineM(coords, centre);
    if (distanceM > radiusM) continue;
    if (!best || distanceM < best.distanceM) best = { merchant: centre.merchant, distanceM };
  }
  return best;
}

/**
 * The shop the user is standing in, if it is one they have bought from before.
 *
 * Pure: no I/O, no clock, no store reads — so the decision can be tested
 * without a device. The caller flattens expenses into `visits`, keeping this
 * function free of the two shapes an expense's position takes in this codebase
 * (a nested `location` object and flat `locationLat`/`locationLng` columns).
 */
export function findNearbyStore(params: {
  coords: { lat: number; lng: number };
  visits: StoreVisit[];
  config?: NearbyStoreConfig;
}): NearbyStore | null {
  const { coords, visits } = params;
  const config = params.config ?? NEARBY_STORE_DEFAULTS;

  if (!isRealPoint(coords)) return null;

  const centres = buildStoreCentres(visits, config.minVisits);
  const best = nearestWithin(coords, centres, config.radiusM);

  return best ? { merchant: best.merchant, distanceM: Math.round(best.distanceM) } : null;
}
