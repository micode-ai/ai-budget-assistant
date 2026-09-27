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

  it('computes the usual week as the median of active prior weeks only', () => {
    const f = assembleDigestFacts(base)!;
    // active weeks sorted: 900,930,940,950,960 (5, odd) -> median = 940
    expect(f.usualWeek).toBe(940);
    expect(f.changePct).toBe(-13); // 820/940 - 1 = -12.77 %, rounds to -13
  });

  it('a rent-like outlier in 2 of 8 prior weeks does not drag the median toward it', () => {
    // 6 ordinary weeks (~250) + 2 rent weeks (~2750): the mean would be ~877,
    // but the median must stay near the ordinary weeks, not the outlier.
    const f = assembleDigestFacts({
      ...base,
      weekTotal: 250,
      priorWeekTotals: [250, 260, 240, 255, 245, 265, 2750, 2750],
    })!;
    // sorted: 240,245,250,255,260,265,2750,2750 -> even count -> mean of the two middles (255,260)
    expect(f.usualWeek).toBe(258); // (255 + 260) / 2 = 257.5, rounds to 258
    expect(f.changePct).toBe(-3); // 250/258 - 1 = -3.1 %
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

  it('nulls usualWeek, changePct and topRise when rounded usual is <= 0', () => {
    const f = assembleDigestFacts({
      ...base,
      weekTotal: 5,
      priorWeekTotals: [0.1, 0.1, 0.1, 0.1],
    })!;
    expect(f.usualWeek).toBeNull();
    expect(f.changePct).toBeNull();
    expect(f.topRise).toBeNull();
  });

  it('includes exactly 4 active prior weeks in usual calculation, as an even-count median', () => {
    const f = assembleDigestFacts({
      ...base,
      priorWeekTotals: [900, 950, 930, 960],
    })!;
    // sorted: 900,930,950,960 -> even count -> mean of the two middles (930,950)
    expect(f.usualWeek).toBe(940);
  });

  it('includes categories at exactly 1.2x their usual in topRise', () => {
    const f = assembleDigestFacts({
      ...base,
      categoryWeek: [{ name: 'Groceries', total: 360 }],
      categoryUsual: [{ name: 'Groceries', total: 300 }],
    })!;
    expect(f.topRise).toEqual({ category: 'Groceries', changePct: 20 }); // 360 / 300 - 1 = 0.2 = 20%
  });

  it('normalizes -0 to 0 in changePct', () => {
    const f = assembleDigestFacts({
      ...base,
      weekTotal: 996,
      priorWeekTotals: [1000, 1000, 1000, 1000],
    })!;
    expect(Object.is(f.changePct, 0)).toBe(true);
  });
});
