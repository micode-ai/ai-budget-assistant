import type { BasketCompareItem, BasketCompareResponse, BasketStoreResult, BasketPerItemCheapest } from '@budget/shared-types';

export interface BasketRow {
  resolvedName: string;
  date: Date;
  unitPrice: number;
  merchant: string;
  currency: string;
}

const STALE_DAYS = 90;
const PARTIAL_COVERAGE = 0.8;
const DAY_MS = 86_400_000;

export function computeBasket(rows: BasketRow[], basket: BasketCompareItem[], now: Date = new Date()): BasketCompareResponse {
  // Aggregate duplicate canonicalNames (a list can hold two rows resolving to the same
  // product): sum quantities and treat as one line so coverage/total/estimate aren't double-counted.
  const aggregated = new Map<string, number>();
  for (const b of basket) aggregated.set(b.canonicalName, (aggregated.get(b.canonicalName) ?? 0) + b.quantity);
  const items: BasketCompareItem[] = [...aggregated.entries()].map(([canonicalName, quantity]) => ({ canonicalName, quantity }));

  const names = new Set(items.map((b) => b.canonicalName));
  const relevant = rows.filter((r) => names.has(r.resolvedName));

  if (items.length === 0 || relevant.length === 0) {
    return {
      currency: majorityCurrency(relevant),
      stores: [],
      perItemCheapest: items.map((b) => ({ canonicalName: b.canonicalName, cheapestStore: null, price: null })),
      missingEverywhere: items.map((b) => b.canonicalName),
    };
  }

  const currency = majorityCurrency(relevant);
  const filtered = relevant.filter((r) => r.currency === currency);

  const byStore = new Map<string, Map<string, { price: number; date: Date }>>();
  for (const r of filtered) {
    const store = byStore.get(r.merchant) ?? new Map<string, { price: number; date: Date }>();
    const cur = store.get(r.resolvedName);
    if (!cur || r.date > cur.date) store.set(r.resolvedName, { price: r.unitPrice, date: r.date });
    byStore.set(r.merchant, store);
  }

  const qtyByName = new Map(items.map((b) => [b.canonicalName, b.quantity]));
  const totalItems = items.length;
  const staleThreshold = new Date(now.getTime() - STALE_DAYS * DAY_MS);

  const stores: BasketStoreResult[] = [];
  for (const [merchant, products] of byStore.entries()) {
    let estimatedTotal = 0;
    let covered = 0;
    let hasStale = false;
    const missingItems: string[] = [];
    for (const b of items) {
      const p = products.get(b.canonicalName);
      if (!p) { missingItems.push(b.canonicalName); continue; }
      covered += 1;
      estimatedTotal += p.price * (qtyByName.get(b.canonicalName) ?? 1);
      if (p.date < staleThreshold) hasStale = true;
    }
    if (covered === 0) continue;
    stores.push({
      merchantName: merchant,
      estimatedTotal: Math.round(estimatedTotal * 100) / 100,
      coveredItems: covered,
      totalItems,
      missingItems,
      hasStale,
      isCheapest: false,
    });
  }

  stores.sort((a, b) => a.estimatedTotal - b.estimatedTotal || b.coveredItems - a.coveredItems);

  const full = stores.filter((s) => s.coveredItems === totalItems);
  const pool = full.length > 0 ? full : stores.filter((s) => s.coveredItems / totalItems >= PARTIAL_COVERAGE);
  if (pool.length > 0) {
    const best = pool.reduce((m, s) => (s.estimatedTotal < m.estimatedTotal ? s : m));
    best.isCheapest = true;
  }

  const perItemCheapest: BasketPerItemCheapest[] = items.map((b) => {
    let cheapestStore: string | null = null;
    let price: number | null = null;
    for (const [merchant, products] of byStore.entries()) {
      const p = products.get(b.canonicalName);
      if (p && (price === null || p.price < price)) { price = p.price; cheapestStore = merchant; }
    }
    return { canonicalName: b.canonicalName, cheapestStore, price: price === null ? null : Math.round(price * 100) / 100 };
  });

  const missingEverywhere = perItemCheapest.filter((p) => p.cheapestStore === null).map((p) => p.canonicalName);

  return { currency, stores, perItemCheapest, missingEverywhere };
}

function majorityCurrency(rows: BasketRow[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1);
  if (counts.size === 0) return 'PLN';
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}
