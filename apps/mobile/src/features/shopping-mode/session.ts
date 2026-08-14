import { haversineM, isRealPoint, type StoreCentre } from '@/features/stores/findNearbyStore';

export interface ShoppingSessionConfig {
  /** Inside this, the user has arrived. Same radius the home card uses. */
  arriveRadiusM: number;
  /** Only past this does the user count as having left. */
  leaveRadiusM: number;
  /** A session this old stops itself, wherever the user is. */
  sessionMaxMs: number;
  /** Coordinate-bearing trusted visits before a merchant is a shop at all. */
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
  arriveRadiusM: 150,
  leaveRadiusM: 250,
  sessionMaxMs: 2 * 60 * 60 * 1000,
  minVisits: 2,
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
  // where the user is, and regardless of whether the position is usable.
  if (now - session.startedAt > config.sessionMaxMs) {
    return { session, notify: null, stop: true };
  }

  if (!isRealPoint(coords)) {
    return { session, notify: null, stop: false };
  }

  if (session.insideMerchant === null) {
    let best: { merchant: string; distanceM: number } | null = null;
    // `centres` arrives name-sorted from buildStoreCentres, so an exact tie
    // resolves by name rather than by array order.
    for (const centre of centres) {
      const distanceM = haversineM(coords, centre);
      if (distanceM > config.arriveRadiusM) continue;
      if (!best || distanceM < best.distanceM) best = { merchant: centre.merchant, distanceM };
    }
    if (!best) return { session, notify: null, stop: false };
    return {
      session: { ...session, insideMerchant: best.merchant },
      notify: { kind: 'arrival', merchant: best.merchant },
      stop: false,
    };
  }

  // Deliberately the shop we are IN, not the nearest one: walking past a
  // second shop must not end the session.
  const centre = centres.find((c) => c.merchant === session.insideMerchant);
  if (!centre) {
    // The snapshot no longer describes the shop we recorded. Nothing sensible
    // is left to measure against, so end rather than guess.
    return { session, notify: null, stop: true };
  }

  if (haversineM(coords, centre) <= config.leaveRadiusM) {
    return { session, notify: null, stop: false };
  }

  return {
    session,
    notify: hasUncheckedItems ? { kind: 'exit', merchant: session.insideMerchant } : null,
    stop: true,
  };
}
