import { detectDeals, DealRow } from './deal-detector';

const d = (s: string) => new Date(s);
const NOW = d('2026-07-08');

function r(name: string, merchant: string, price: number, date: string, currency = 'PLN'): DealRow {
  return { resolvedName: name, merchant, unitPrice: price, date: d(date), currency };
}

describe('detectDeals', () => {
  it('flags a store whose recent price is >=15% below the 90-day average', () => {
    // avg ~5.0; recent Lidl price 4.0 = 20% below → deal
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
      r('Bread', 'Lidl', 3.8, '2026-07-05'), // 5% below avg ~3.93
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
    const rows = [
      r('A', 'S1', 10, '2026-05-01'), r('A', 'S1', 10, '2026-06-01'), r('A', 'S1', 8, '2026-07-05'), // 20%
      r('B', 'S2', 10, '2026-05-01'), r('B', 'S2', 10, '2026-06-01'), r('B', 'S2', 5, '2026-07-05'), // 50%
    ];
    const deals = detectDeals(rows, NOW);
    expect(deals[0].canonicalName).toBe('B');
  });
});
