/**
 * Store-pin consensus (ABA-642 audit). Pure: no I/O.
 *
 * A pin is published only when at least `k` DISTINCT contributors' candidate
 * coordinates agree within `radiusM` metres, and it is published at the MEDIAN
 * coordinate of the agreeing group — never at any one contributor's point. This
 * replaces create-only "first writer wins", which let a single contributor squat
 * (or mis-place) a store's pin.
 */

export const PIN_AGREEMENT_RADIUS_M = 150;

export interface PinCandidate {
  contributorKey: string;
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in metres (haversine). */
export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * The agreed pin, or null while fewer than `k` distinct contributors agree. For each
 * candidate the group is "every candidate within the radius of it"; the largest group
 * (by distinct contributors; ties broken by the lexicographically smallest centre so
 * the result is deterministic) wins and its median coordinate is returned.
 */
export function resolveStorePin(
  candidates: PinCandidate[],
  k: number,
  radiusM: number = PIN_AGREEMENT_RADIUS_M,
): { lat: number; lng: number; agreeing: number } | null {
  const valid = candidates.filter(
    (c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && !(c.lat === 0 && c.lng === 0),
  );
  let best: PinCandidate[] = [];
  let bestKey = '';
  for (const centre of valid) {
    const group = valid.filter((c) => distanceMeters(centre.lat, centre.lng, c.lat, c.lng) <= radiusM);
    const distinct = new Set(group.map((g) => g.contributorKey)).size;
    const bestDistinct = new Set(best.map((g) => g.contributorKey)).size;
    const key = `${centre.lat.toFixed(7)}|${centre.lng.toFixed(7)}`;
    if (distinct > bestDistinct || (distinct === bestDistinct && distinct > 0 && key < bestKey)) {
      best = group;
      bestKey = key;
    }
  }
  const agreeing = new Set(best.map((g) => g.contributorKey)).size;
  if (agreeing < Math.max(k, 1)) return null;
  return {
    lat: Math.round(medianOf(best.map((b) => b.lat)) * 1e7) / 1e7,
    lng: Math.round(medianOf(best.map((b) => b.lng)) * 1e7) / 1e7,
    agreeing,
  };
}
