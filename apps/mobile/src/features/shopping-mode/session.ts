import {
  haversineM,
  isRealPoint,
  nearestWithin,
  NEARBY_STORE_DEFAULTS,
  type StoreCentre,
} from '@/features/stores/findNearbyStore';

export interface ShoppingSessionConfig {
  /** Inside this, the user has arrived. Same radius the home card uses. */
  arriveRadiusM: number;
  /** Only past this does the user count as having left. */
  leaveRadiusM: number;
  /** A session this old stops itself, wherever the user is. */
  sessionMaxMs: number;
  /**
   * Coordinate-bearing trusted visits before a merchant is a shop at all.
   * Unused inside this reducer — it belongs to `buildStoreCentres`, the
   * snapshot builder that turns expense history into `StoreCentre[]`. Kept
   * here so one config object describes the whole feature end to end; do not
   * delete it as dead code.
   */
  minVisits: number;
}

/**
 * `arriveRadiusM` and `leaveRadiusM` MUST differ, and the gap is the point.
 *
 * A phone standing still at a shop entrance reports positions that wander by
 * tens of metres. On one shared threshold that wander crosses the boundary
 * repeatedly, and every crossing here is a notification — arrival, departure,
 * arrival. The 100 m gap means that once inside, it takes a real walk away to
 * get out again.
 */
export const SHOPPING_MODE_DEFAULTS: ShoppingSessionConfig = {
  arriveRadiusM: NEARBY_STORE_DEFAULTS.radiusM,
  leaveRadiusM: 250,
  sessionMaxMs: 2 * 60 * 60 * 1000,
  minVisits: NEARBY_STORE_DEFAULTS.minVisits,
};

export interface ShoppingSession {
  startedAt: number;
  /** The shop we are in, or null while still on the way. */
  insideMerchant: string | null;
}

export interface ShoppingSessionResult {
  session: ShoppingSession;
  notify: { kind: 'arrival' | 'exit'; merchant: string } | null;
  /** True means: unregister the task and tear the foreground service down. */
  stop: boolean;
}

/**
 * The whole of Shopping Mode's decision-making, as one pure function.
 *
 * Pure on purpose: the surrounding machinery — a foreground service, a
 * headless JS context, an OS notification — cannot be exercised under Jest in
 * this repo, so everything that can be decided without a device is decided
 * here, where it is testable.
 */
export function reduceShoppingSession(params: {
  session: ShoppingSession;
  centres: StoreCentre[];
  coords: { lat: number; lng: number };
  now: number;
  hasUncheckedItems: boolean;
  config?: ShoppingSessionConfig;
}): ShoppingSessionResult {
  const { session, centres, coords, now, hasUncheckedItems } = params;
  const config = params.config ?? SHOPPING_MODE_DEFAULTS;

  // Checked before anything else: a session past its cap ends regardless of
  // where the user is, and regardless of whether the position is usable. In
  // particular this MUST run before the null-island guard below — a session
  // that only ever receives unusable fixes (GPS off, indoors, stale cache)
  // must still be able to end itself, or the foreground service outlives its
  // cap for as long as the app stays closed.
  if (now - session.startedAt > config.sessionMaxMs) {
    return { session, notify: null, stop: true };
  }

  if (!isRealPoint(coords)) {
    return { session, notify: null, stop: false };
  }

  if (session.insideMerchant === null) {
    const best = nearestWithin(coords, centres, config.arriveRadiusM);
    if (!best) return { session, notify: null, stop: false };
    return {
      session: { ...session, insideMerchant: best.merchant },
      notify: { kind: 'arrival', merchant: best.merchant },
      stop: false,
    };
  }

  // Deliberately the shop we are IN, not the nearest one: walking past a
  // second shop must not end the session. Case-insensitive because
  // `buildStoreCentres` groups merchants case-insensitively too — "BIEDRONKA"
  // off a bank import and "Biedronka" off a receipt are the one shop this
  // session is inside.
  //
  // The NEAREST centre of that name, not the first one carrying it: since
  // `buildStoreCentres` emits one centre per branch, a chain contributes
  // several centres sharing a name, and picking by name alone picks by array
  // position. A branch across town would then read as "far away" on the very
  // first fix after arrival, ending the trip with an exit notification while
  // the user is still in the aisle. Walking from one branch to another keeps
  // the session alive, which is the right answer for a user who is still
  // shopping at that chain.
  const insideKey = session.insideMerchant.toLowerCase();
  let distanceM = Infinity;
  for (const c of centres) {
    if (c.merchant.toLowerCase() !== insideKey) continue;
    distanceM = Math.min(distanceM, haversineM(coords, c));
  }
  if (distanceM === Infinity) {
    // The snapshot no longer describes the shop we recorded. Nothing sensible
    // is left to measure against, so end rather than guess.
    return { session, notify: null, stop: true };
  }

  if (distanceM <= config.leaveRadiusM) {
    return { session, notify: null, stop: false };
  }

  // Not exactly-once: this branch returns `session` unchanged, so calling the
  // reducer again with the same session and any position still past the
  // leave radius fires a second exit. That is deliberate — a "notified"
  // field on `ShoppingSession` would trade a pure function of position and
  // time for a stateful one, and is not worth it here. Instead the caller
  // MUST clear the persisted session SYNCHRONOUSLY, before anything else is
  // awaited — before the notification is shown, not merely before the
  // foreground service is torn down.
  return {
    session,
    notify: hasUncheckedItems ? { kind: 'exit', merchant: session.insideMerchant } : null,
    stop: true,
  };
}
