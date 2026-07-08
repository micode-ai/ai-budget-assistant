import { predictRestock } from './restock-predictor';

const d = (s: string) => new Date(s);
const NOW = d('2026-07-08');

describe('predictRestock', () => {
  it('flags a product overdue past its median gap', () => {
    // bought every ~7 days, last purchase 10 days ago → overdue
    const map = new Map<string, Date[]>([
      ['Milk', [d('2026-06-07'), d('2026-06-14'), d('2026-06-21'), d('2026-06-28')]],
    ]);
    const res = predictRestock(map, NOW);
    expect(res).toHaveLength(1);
    expect(res[0].canonicalName).toBe('Milk');
    expect(res[0].medianGapDays).toBe(7);
    expect(res[0].dueInDays).toBeLessThan(0); // NOW is 10 days after 06-28, median 7 → -3
    expect(res[0].purchaseCount).toBe(4);
  });

  it('does not flag a product bought recently (within its gap)', () => {
    const map = new Map<string, Date[]>([
      ['Bread', [d('2026-06-20'), d('2026-06-27'), d('2026-07-04')]], // last 4 days ago, median 7
    ]);
    const res = predictRestock(map, NOW);
    expect(res[0].dueInDays).toBeGreaterThan(0);
  });

  it('ignores products with fewer than 3 purchases', () => {
    const map = new Map<string, Date[]>([['Rare', [d('2026-06-01'), d('2026-07-01')]]]);
    expect(predictRestock(map, NOW)).toEqual([]);
  });

  it('sorts most-overdue first', () => {
    const map = new Map<string, Date[]>([
      ['A', [d('2026-06-24'), d('2026-07-01'), d('2026-07-07')]], // median 6.5, last 1d ago → not overdue
      ['B', [d('2026-06-01'), d('2026-06-08'), d('2026-06-15')]], // median 7, last 23d ago → very overdue
    ]);
    const res = predictRestock(map, NOW);
    expect(res[0].canonicalName).toBe('B');
  });
});
