import { assembleDigestFacts, type DigestInputs } from '../digest-facts.util';

const base: DigestInputs = {
  currency: 'PLN',
  weekTotal: 820,
  priorWeekTotals: [900, 950, 0, 930, 960, 940],
  categoryWeek: [
    { name: 'Groceries', total: 420 },
    { name: 'Coffee', total: 40 },
    { name: 'Transport', total: 200 },
  ],
  categoryUsual: [
    { name: 'Groceries', total: 300 },
    { name: 'Coffee', total: 10 },
    { name: 'Transport', total: 210 },
  ],
  safeToSpendToday: 64.4,
  daysToIncome: 5,
  shieldItem: { name: 'Mleko 3,2% 1L', monthlyChangePct: 4.26 },
  restockNames: ['milk', 'bread', 'eggs', 'coffee'],
  realChangePct: -3.04,
};

describe('assembleDigestFacts', () => {
  it('returns null for a week without spending', () => {
    expect(assembleDigestFacts({ ...base, weekTotal: 0 })).toBeNull();
  });

  it('computes the usual week from active prior weeks only', () => {
    const f = assembleDigestFacts(base)!;
    expect(f.usualWeek).toBe(936); // mean of 900,950,930,960,940
    expect(f.changePct).toBe(-12); // 820/936 - 1 = -12.4 %
  });

  it('has no usual week with fewer than 4 active prior weeks', () => {
    const f = assembleDigestFacts({
      ...base,
      priorWeekTotals: [900, 0, 950, 0, 930],
    })!;
    expect(f.usualWeek).toBeNull();
    expect(f.changePct).toBeNull();
  });

  it('reports the biggest real rise, ignoring tiny categories', () => {
    expect(assembleDigestFacts(base)!.topRise).toEqual({
      category: 'Groceries',
      changePct: 40,
    });
  });

  it('rounds and caps the rest', () => {
    const f = assembleDigestFacts(base)!;
    expect(f.safeToSpendToday).toBe(64);
    expect(f.shieldItem).toEqual({
      name: 'Mleko 3,2% 1L',
      monthlyChangePct: 4,
    });
    expect(f.restock).toEqual(['milk', 'bread', 'eggs']);
    expect(f.realChangePct).toBe(-3);
  });
});
