import { computeBasket, BasketRow } from './basket-calculator';

const d = (s: string) => new Date(s);
const NOW = d('2026-07-07');

function row(name: string, merchant: string, price: number, date = '2026-07-01', currency = 'PLN'): BasketRow {
  return { resolvedName: name, merchant, unitPrice: price, date: d(date), currency };
}

describe('computeBasket', () => {
  it('picks the cheapest full-coverage store', () => {
    const rows = [
      row('Milk', 'Biedronka', 3.0), row('Bread', 'Biedronka', 4.0),
      row('Milk', 'Lidl', 2.5), row('Bread', 'Lidl', 3.5),
    ];
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }, { canonicalName: 'Bread', quantity: 1 }], NOW);
    const cheapest = res.stores.find((s) => s.isCheapest);
    expect(cheapest?.merchantName).toBe('Lidl');
    expect(cheapest?.estimatedTotal).toBe(6.0);
    expect(cheapest?.coveredItems).toBe(2);
    expect(res.stores[0].merchantName).toBe('Lidl'); // sorted cheapest first
  });

  it('scales by quantity and uses the latest price per store', () => {
    const rows = [row('Milk', 'Lidl', 2.0, '2026-06-01'), row('Milk', 'Lidl', 3.0, '2026-07-01')];
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 2 }], NOW);
    expect(res.stores[0].estimatedTotal).toBe(6.0); // latest 3.0 * qty 2
  });

  it('does not award a badge when no store reaches 80% coverage', () => {
    const rows = [row('Milk', 'Lidl', 2.5), row('Eggs', 'Lidl', 8.0), row('Milk', 'Biedronka', 3.0)];
    const basket = [
      { canonicalName: 'Milk', quantity: 1 }, { canonicalName: 'Eggs', quantity: 1 },
      { canonicalName: 'Bread', quantity: 1 }, { canonicalName: 'Butter', quantity: 1 }, { canonicalName: 'Ham', quantity: 1 },
    ];
    const res = computeBasket(rows, basket, NOW);
    // no store covers all 5; Lidl covers 2/5 = 40%, Biedronka 1/5 — none >=80%, so no badge
    expect(res.stores.every((s) => !s.isCheapest)).toBe(true);
    expect(res.stores.find((s) => s.merchantName === 'Lidl')?.missingItems.slice().sort()).toEqual(['Bread', 'Butter', 'Ham']);
  });

  it('awards the badge to an eligible >=80% store over a cheaper store below 80%', () => {
    const rows = [
      row('A', 'StoreA', 5), row('B', 'StoreA', 5), row('C', 'StoreA', 5), row('D', 'StoreA', 5),
      row('A', 'StoreB', 2), row('B', 'StoreB', 3),
    ];
    const basket = ['A', 'B', 'C', 'D', 'E'].map((n) => ({ canonicalName: n, quantity: 1 }));
    const res = computeBasket(rows, basket, NOW);
    expect(res.stores.find((s) => s.isCheapest)?.merchantName).toBe('StoreA'); // 4/5 = 80%, eligible
    expect(res.stores.find((s) => s.merchantName === 'StoreB')?.isCheapest).toBe(false); // cheaper but 2/5 < 80%
  });

  it('perItemCheapest picks the cheaper store for an item priced at multiple stores', () => {
    const rows = [row('Milk', 'Biedronka', 3.0), row('Milk', 'Lidl', 2.5)];
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }], NOW);
    const milk = res.perItemCheapest.find((p) => p.canonicalName === 'Milk');
    expect(milk?.cheapestStore).toBe('Lidl');
    expect(milk?.price).toBe(2.5);
  });

  it('does not flag a price exactly 90 days old as stale', () => {
    const rows = [row('Milk', 'Lidl', 2.5, '2026-04-08')];
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }], NOW);
    expect(res.stores[0].hasStale).toBe(false);
  });

  it('flags stale prices older than 90 days', () => {
    const rows = [row('Milk', 'Lidl', 2.5, '2026-01-01')]; // > 90 days before NOW
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }], NOW);
    expect(res.stores[0].hasStale).toBe(true);
  });

  it('filters to the majority currency', () => {
    const rows = [row('Milk', 'Lidl', 2.5, '2026-07-01', 'PLN'), row('Milk', 'Lidl', 3.0, '2026-07-02', 'PLN'), row('Milk', 'Revolut', 1.0, '2026-07-03', 'EUR')];
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }], NOW);
    expect(res.currency).toBe('PLN');
    expect(res.stores.find((s) => s.merchantName === 'Revolut')).toBeUndefined();
  });

  it('lists items no store can price under missingEverywhere', () => {
    const rows = [row('Milk', 'Lidl', 2.5)];
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }, { canonicalName: 'Caviar', quantity: 1 }], NOW);
    expect(res.missingEverywhere).toEqual(['Caviar']);
    expect(res.perItemCheapest.find((p) => p.canonicalName === 'Caviar')?.cheapestStore).toBeNull();
  });

  it('returns empty stores for an empty basket', () => {
    const res = computeBasket([row('Milk', 'Lidl', 2.5)], [], NOW);
    expect(res.stores).toEqual([]);
  });

  it('aggregates duplicate canonicalNames into one line (sums quantity, counts once)', () => {
    const rows = [row('Milk', 'Lidl', 2.0)];
    const res = computeBasket(rows, [
      { canonicalName: 'Milk', quantity: 1 },
      { canonicalName: 'Milk', quantity: 2 },
    ], NOW);
    expect(res.stores[0].totalItems).toBe(1);
    expect(res.stores[0].coveredItems).toBe(1);
    expect(res.stores[0].estimatedTotal).toBe(6.0); // 2.0 * (1 + 2)
    expect(res.perItemCheapest).toHaveLength(1);
  });
});

describe('computeBasket geo', () => {
  it('sets lat/lng, distanceKm and nearby when store coords + origin are given', () => {
    const rows = [row('Milk', 'Lidl', 2.5)];
    const coords = new Map([['Lidl', { lat: 52.23, lng: 21.01 }]]);
    const origin = { lat: 52.24, lng: 21.02 }; // ~1.3 km away
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }], NOW, coords, origin);
    const s = res.stores[0];
    expect(s.lat).toBe(52.23);
    expect(s.lng).toBe(21.01);
    expect(s.distanceKm).toBeGreaterThan(0);
    expect(s.distanceKm).toBeLessThan(5);
    expect(s.nearby).toBe(true);
  });

  it('marks a far store as not nearby', () => {
    const rows = [row('Milk', 'FarStore', 2.5)];
    const coords = new Map([['FarStore', { lat: 50.06, lng: 19.94 }]]); // Kraków
    const origin = { lat: 52.23, lng: 21.01 }; // Warsaw, ~250 km
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }], NOW, coords, origin);
    expect(res.stores[0].nearby).toBe(false);
    expect(res.stores[0].distanceKm).toBeGreaterThan(100);
  });

  it('sets lat/lng but leaves distance undefined when no origin', () => {
    const rows = [row('Milk', 'Lidl', 2.5)];
    const coords = new Map([['Lidl', { lat: 52.23, lng: 21.01 }]]);
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }], NOW, coords);
    expect(res.stores[0].lat).toBe(52.23);
    expect(res.stores[0].distanceKm).toBeUndefined();
    expect(res.stores[0].nearby).toBeUndefined();
  });

  it('leaves geo fields undefined when the store has no coords', () => {
    const rows = [row('Milk', 'Unknown', 2.5)];
    const origin = { lat: 52.23, lng: 21.01 };
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }], NOW, new Map(), origin);
    expect(res.stores[0].lat).toBeUndefined();
    expect(res.stores[0].distanceKm).toBeUndefined();
  });

  it('ignores a (0,0) null-island store coord', () => {
    const rows = [row('Milk', 'Lidl', 2.5)];
    const coords = new Map([['Lidl', { lat: 0, lng: 0 }]]);
    const origin = { lat: 52.23, lng: 21.01 };
    const res = computeBasket(rows, [{ canonicalName: 'Milk', quantity: 1 }], NOW, coords, origin);
    expect(res.stores[0].lat).toBeUndefined();
    expect(res.stores[0].distanceKm).toBeUndefined();
  });

  it('respects a custom nearbyRadiusKm override', () => {
    const rows = [row('Milk', 'Lidl', 2.5)];
    const coords = new Map([['Lidl', { lat: 52.23, lng: 21.01 }]]);
    const origin = { lat: 52.24, lng: 21.02 }; // ~1.3 km away
    const item = [{ canonicalName: 'Milk', quantity: 1 }];
    // default radius 5 → within → nearby
    expect(computeBasket(rows, item, NOW, coords, origin, 5).stores[0].nearby).toBe(true);
    // tightened radius 1 → 1.3 km is outside → not nearby (proves the param is actually used)
    expect(computeBasket(rows, item, NOW, coords, origin, 1).stores[0].nearby).toBe(false);
  });
});
