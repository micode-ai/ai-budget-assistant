import { detectDeals, DealRow } from './deal-detector';

const d = (s: string) => new Date(s);
const NOW = d('2026-07-08');

function r(name: string, merchant: string, price: number, date: string, currency = 'PLN'): DealRow {
  return { resolvedName: name, merchant, unitPrice: price, date: d(date), currency };
}

describe('detectDeals', () => {
  it('flags a store whose recent price is >=15% below the 90-day average', () => {
    // avg includes recent: (5.0+5.0+5.0+4.0)/4=4.75; recent Lidl price 4.0 vs 4.75 ≈ 15.8% below → deal
    const rows = [
      r('Milk', 'Biedronka', 5.0, '2026-05-01'), r('Milk', 'Biedronka', 5.0, '2026-06-01'),
      r('Milk', 'Lidl', 5.0, '2026-06-10'), r('Milk', 'Lidl', 4.0, '2026-07-05'),
    ];
    const deals = detectDeals(rows, NOW);
    const milk = deals.find((x) => x.canonicalName === 'Milk' && x.merchant === 'Lidl');
    expect(milk).toBeDefined();
    expect(milk!.dropPct).toBeGreaterThanOrEqual(15);
    expect(milk!.price).toBe(4.0);
  });

  it('does not flag a small (<15%) drop', () => {
    const rows = [
      r('Bread', 'Lidl', 4.0, '2026-05-01'), r('Bread', 'Lidl', 4.0, '2026-06-01'),
      r('Bread', 'Lidl', 3.8, '2026-07-05'), // avg includes recent: (4.0+4.0+3.8)/3≈3.93; 3.8 vs 3.93 ≈ 3.4% below
    ];
    expect(detectDeals(rows, NOW)).toEqual([]);
  });

  it('ignores products with fewer than 3 price points', () => {
    const rows = [r('Rare', 'Lidl', 10, '2026-06-01'), r('Rare', 'Lidl', 4, '2026-07-05')];
    expect(detectDeals(rows, NOW)).toEqual([]);
  });

  it('ignores an old low price outside the recent window', () => {
    // low price is 60 days ago (outside the 14-day recent window) → not a current deal
    const rows = [
      r('Eggs', 'Lidl', 10, '2026-04-15'), r('Eggs', 'Lidl', 10, '2026-05-15'),
      r('Eggs', 'Lidl', 6, '2026-05-09'), // >14 days before NOW
    ];
    expect(detectDeals(rows, NOW)).toEqual([]);
  });

  it('sorts by drop percentage descending', () => {
    // avg includes the recent point. A: (10+10+6)/3=8.667, 6 → ~31%. B: (10+10+4)/3=8, 4 → 50%.
    const rows = [
      r('A', 'S1', 10, '2026-05-01'), r('A', 'S1', 10, '2026-06-01'), r('A', 'S1', 6, '2026-07-05'),
      r('B', 'S2', 10, '2026-05-01'), r('B', 'S2', 10, '2026-06-01'), r('B', 'S2', 4, '2026-07-05'),
    ];
    const deals = detectDeals(rows, NOW);
    expect(deals).toHaveLength(2);
    expect(deals[0].canonicalName).toBe('B');
    expect(deals[1].canonicalName).toBe('A');
    expect(deals[0].dropPct).toBeGreaterThan(deals[1].dropPct);
  });

  it('uses the latest recent price per store, not an older recent low', () => {
    // Two points inside the 14-day window (NOW=07-08 → recent since 06-24):
    // an older cheap one (06-28, price 3) and a NEWER normal one (07-06, price 5).
    // avg=(5+5+3+5)/4=4.5; latest=5 → 5 > 4.5*0.85 → NOT a deal (would be a deal if min-price were used).
    const rows = [
      r('Milk', 'Lidl', 5, '2026-05-01'), r('Milk', 'Lidl', 5, '2026-06-01'),
      r('Milk', 'Lidl', 3, '2026-06-28'), r('Milk', 'Lidl', 5, '2026-07-06'),
    ];
    expect(detectDeals(rows, NOW)).toEqual([]);
  });

  it('restricts to the majority currency of a product', () => {
    // PLN is majority (3 pts): avg=(5+5+3.5)/3=4.5, latest Lidl 3.5 → ~22% deal.
    // A single EUR outlier at 1 must be ignored (no EUR/Revolut deal emitted).
    const rows = [
      r('Milk', 'Lidl', 5, '2026-05-01', 'PLN'), r('Milk', 'Lidl', 5, '2026-06-01', 'PLN'),
      r('Milk', 'Lidl', 3.5, '2026-07-05', 'PLN'),
      r('Milk', 'Revolut', 1, '2026-07-05', 'EUR'),
    ];
    const deals = detectDeals(rows, NOW);
    expect(deals).toHaveLength(1);
    expect(deals[0].merchant).toBe('Lidl');
    expect(deals[0].currency).toBe('PLN');
    expect(deals.find((x) => x.merchant === 'Revolut')).toBeUndefined();
  });
});
