import { formatCurrency } from '@budget/shared-utils';
import type { BasketStoreResult } from '@budget/shared-types';
import type { ExpenseMapPoint } from './buildMapPoints';

/**
 * Turn a basket-compare result's per-store list into map pins.
 * Stores without coordinates (not geo-tagged yet) or at (0,0) — "null
 * island", the same undecryptable/never-set sentinel used for expenses — are
 * excluded and counted in `missingCount` for the banner. Mirrors
 * `buildExpenseMapPoints` in `./buildMapPoints.ts`.
 */
export function buildStoreMapPoints(
  stores: BasketStoreResult[],
  currency: string,
): { points: ExpenseMapPoint[]; missingCount: number } {
  const points: ExpenseMapPoint[] = [];
  let missingCount = 0;
  for (const s of stores) {
    if (s.lat == null || s.lng == null || (s.lat === 0 && s.lng === 0)) {
      missingCount++;
      continue;
    }
    const dist = s.distanceKm != null ? ` · ${s.distanceKm} km` : '';
    points.push({
      id: s.merchantName,
      lat: s.lat,
      lng: s.lng,
      title: s.merchantName,
      amountLabel: `${formatCurrency(s.estimatedTotal, currency)}${dist}`,
    });
  }
  return { points, missingCount };
}
