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

  it('awards the badge to best >=80% partial when no store has full coverage', () => {
    const rows = [row('Milk', 'Lidl', 2.5), row('Eggs', 'Lidl', 8.0), row('Milk', 'Biedronka', 3.0)];
    const basket = [
      { canonicalName: 'Milk', quantity: 1 }, { canonicalName: 'Eggs', quantity: 1 },
      { canonicalName: 'Bread', quantity: 1 }, { canonicalName: 'Butter', quantity: 1 }, { canonicalName: 'Ham', quantity: 1 },
    ];
    const res = computeBasket(rows, basket, NOW);
    // no store covers all 5; Lidl covers 2/5 = 40%, Biedronka 1/5 — none >=80%, so no badge
    expect(res.stores.every((s) => !s.isCheapest)).toBe(true);
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
});
