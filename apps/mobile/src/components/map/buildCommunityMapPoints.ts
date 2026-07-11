import type { TFunction } from 'i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { CommunityPriceMapPoint } from '@budget/shared-types';
import type { ExpenseMapPoint } from './buildMapPoints';

/**
 * Turn a community-prices "where's cheapest" map response into map pins.
 * Mirrors `buildStoreMapPoints`. The backend already filters out stores with
 * no known coordinate, but (0,0) — "null island" — is excluded defensively
 * here too, same convention as `buildExpenseMapPoints`/`buildStoreMapPoints`.
 */
export function buildCommunityMapPoints(
  points: CommunityPriceMapPoint[],
  t: TFunction,
): ExpenseMapPoint[] {
  const result: ExpenseMapPoint[] = [];
  const seen = new Map<string, number>();
  for (const p of points) {
    if (p.lat == null || p.lng == null || (p.lat === 0 && p.lng === 0)) {
      continue;
    }
    let id = p.merchantName;
    const count = seen.get(p.merchantName) ?? 0;
    seen.set(p.merchantName, count + 1);
    if (count > 0) id = `${p.merchantName}-${count}`;

    const cheapest = p.isCheapest ? ` · ${t('communityPrices.cheapest')}` : '';
    result.push({
      id,
      lat: p.lat,
      lng: p.lng,
      title: p.merchantName,
      amountLabel: `${formatCurrency(p.medianPrice, p.currencyCode)}${cheapest}`,
    });
  }
  return result;
}
