import { formatCurrency } from '@budget/shared-utils';
import type { Expense } from '@budget/shared-types';

export interface ExpenseMapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  amountLabel: string;
}

/**
 * Turn the (already filtered) expense list into map pins.
 * Rows without coordinates are counted in `missingCount` for the banner.
 * (0,0) is excluded: it is the zeroed plaintext of an undecryptable E2EE
 * tier-2 row ("null island"), never a real purchase location.
 */
export function buildExpenseMapPoints(expenses: Expense[]): {
  points: ExpenseMapPoint[];
  missingCount: number;
} {
  const points: ExpenseMapPoint[] = [];
  let missingCount = 0;
  for (const e of expenses) {
    const loc = e.location;
    if (!loc || (loc.lat === 0 && loc.lng === 0)) {
      missingCount++;
      continue;
    }
    points.push({
      id: e.id,
      lat: loc.lat,
      lng: loc.lng,
      title: e.merchant || e.description || '',
      amountLabel: formatCurrency(e.amount, e.currencyCode),
    });
  }
  return { points, missingCount };
}
