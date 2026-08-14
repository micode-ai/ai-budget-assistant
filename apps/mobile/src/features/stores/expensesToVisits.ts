import type { Expense } from '@budget/shared-types';
import type { StoreVisit } from './findNearbyStore';

/**
 * Flatten expenses into the shape the matcher takes.
 *
 * Lives here rather than in `findNearbyStore.ts` so that module stays free of
 * the two shapes an expense's position takes in this codebase: a nested
 * `location` object (rebuilt by the pull merge) and flat
 * `locationLat`/`locationLng` columns straight from the API, which arrive as
 * Prisma Decimal *strings* and are correctly skipped by the `typeof` guard.
 *
 * Two callers need exactly this loop — `useNearbyStore` for the home card and
 * the Shopping Mode snapshot builder — and a second copy would be the thing
 * that silently stops working the day the Expense shape changes.
 *
 * `source` is carried through untouched: deciding whether a coordinate
 * describes a shop or the phone's owner is the matcher's job, not this one's.
 */
export function expensesToVisits(expenses: Expense[]): StoreVisit[] {
  const visits: StoreVisit[] = [];
  for (const e of expenses) {
    const merchant = e.merchant?.trim();
    if (!merchant) continue;
    const lat = e.location?.lat ?? e.locationLat;
    const lng = e.location?.lng ?? e.locationLng;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    visits.push({ merchant, lat, lng, source: e.source });
  }
  return visits;
}
