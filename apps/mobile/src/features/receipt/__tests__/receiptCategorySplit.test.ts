import {
  buildCategorySplits,
  RECEIPT_SPLIT_DEFAULTS,
  type SplitInputItem,
  rescaleSplits,
} from '@budget/shared-utils';
import { buildManualSplits, withDepositGroup } from '../manualSplits';

const item = (
  index: number,
  amount: number,
  categoryId: string | null,
  categoryName: string | null = categoryId,
): SplitInputItem => ({ index, amount, categoryId, categoryName });

describe('buildCategorySplits', () => {
  it('splits a clean receipt and sums exactly to the total', () => {
    const splits = buildCategorySplits({
      items: [item(0, 180, 'c-food', 'Groceries'), item(1, 35, 'c-home', 'Household'), item(2, 25, 'c-alc', 'Alcohol')],
      total: 240,
    });

    expect(splits.map((s) => [s.categoryId, s.amount])).toEqual([
      ['c-food', 180],
      ['c-home', 35],
      ['c-alc', 25],
    ]);
    expect(splits.reduce((sum, s) => sum + s.amount, 0)).toBe(240);
  });

  it('is sorted by amount descending', () => {
    const splits = buildCategorySplits({
      items: [item(0, 10, 'c-a'), item(1, 90, 'c-b')],
      total: 100,
    });
    expect(splits.map((s) => s.categoryId)).toEqual(['c-b', 'c-a']);
  });

  it('gives the residual from unassigned lines to the largest group', () => {
    // 100 + 40 assigned, 10 unassigned, total 150 → largest group absorbs the 10.
    const splits = buildCategorySplits({
      items: [item(0, 100, 'c-a'), item(1, 40, 'c-b'), item(2, 10, null, null)],
      total: 150,
    });

    expect(splits.find((s) => s.categoryId === 'c-a')!.amount).toBe(110);
    expect(splits.find((s) => s.categoryId === 'c-b')!.amount).toBe(40);
    expect(splits.reduce((sum, s) => sum + s.amount, 0)).toBe(150);
  });

  it('absorbs a negative residual (a discount) into the largest group', () => {
    // 140 of lines against a 135 total is a 3.7% gap — inside the tolerance,
    // so the 5 comes off the largest group rather than blocking the split.
    const splits = buildCategorySplits({
      items: [item(0, 100, 'c-a'), item(1, 40, 'c-b')],
      total: 135,
    });

    expect(splits.find((s) => s.categoryId === 'c-a')!.amount).toBe(95);
    expect(splits.find((s) => s.categoryId === 'c-b')!.amount).toBe(40);
    expect(splits.reduce((sum, s) => sum + s.amount, 0)).toBe(135);
  });

  it('refuses to split when items are further from the total than the tolerance', () => {
    // 140 of items against a 240 total is a 41% gap — we cannot honestly attribute it.
    expect(
      buildCategorySplits({
        items: [item(0, 100, 'c-a'), item(1, 40, 'c-b')],
        total: 240,
      }),
    ).toEqual([]);
  });

  it('refuses to split when the residual would wipe out the largest group', () => {
    // Lines total 5 against a 2 total. The tolerance is opened wide enough to
    // reach the guard, so this exercises the guard and not the tolerance:
    // the -3 residual takes the 3 group to exactly 0, which is not a split.
    expect(
      buildCategorySplits({
        items: [item(0, 3, 'c-a'), item(1, 2, 'c-b')],
        total: 2,
        config: { tolerancePct: 200 },
      }),
    ).toEqual([]);
  });

  it('returns nothing when fewer than two categories are present', () => {
    expect(buildCategorySplits({ items: [item(0, 50, 'c-a'), item(1, 50, 'c-a')], total: 100 })).toEqual([]);
    expect(buildCategorySplits({ items: [item(0, 100, null, null)], total: 100 })).toEqual([]);
    expect(buildCategorySplits({ items: [], total: 100 })).toEqual([]);
  });

  it('returns nothing for a non-positive or non-finite total', () => {
    expect(buildCategorySplits({ items: [item(0, 5, 'c-a'), item(1, 5, 'c-b')], total: 0 })).toEqual([]);
    expect(buildCategorySplits({ items: [item(0, 5, 'c-a'), item(1, 5, 'c-b')], total: Number.NaN })).toEqual([]);
  });

  it('makes percentages sum to exactly 100', () => {
    const splits = buildCategorySplits({
      items: [item(0, 33.33, 'c-a'), item(1, 33.33, 'c-b'), item(2, 33.34, 'c-c')],
      total: 100,
    });
    expect(splits.reduce((sum, s) => sum + s.percentage, 0)).toBe(100);
  });

  it('reports which lines produced each group', () => {
    const splits = buildCategorySplits({
      items: [item(0, 10, 'c-a'), item(1, 5, 'c-b'), item(2, 20, 'c-a')],
      total: 35,
    });
    expect(splits.find((s) => s.categoryId === 'c-a')!.itemIndexes).toEqual([0, 2]);
  });

  it('ignores lines with a non-positive or non-finite amount', () => {
    const splits = buildCategorySplits({
      items: [item(0, 100, 'c-a'), item(1, 40, 'c-b'), item(2, 0, 'c-c'), item(3, Number.NaN, 'c-d')],
      total: 140,
    });
    expect(splits.map((s) => s.categoryId)).toEqual(['c-a', 'c-b']);
  });

  it('defaults the tolerance to 5 percent', () => {
    expect(RECEIPT_SPLIT_DEFAULTS.tolerancePct).toBe(5);
  });

  it('returns amounts correct to the cent with awkward floating-point numbers', () => {
    // This test exists because round numbers (180, 35, 25) hide IEEE-754 epsilon
    // when re-summing floats. Three items of 6.66/6.66/6.67 against 19.99 expose
    // the real guarantee: each amount is exact to the cent, and the cent-values
    // sum exactly by construction. Direct float re-summation carries epsilon.
    const splits = buildCategorySplits({
      items: [item(0, 6.66, 'c-a'), item(1, 6.66, 'c-b'), item(2, 6.67, 'c-c')],
      total: 19.99,
    });

    // Each individual amount must be exact to the cent (not epsilon-corrupted).
    const amounts = splits.map((s) => s.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([6.66, 6.66, 6.67]);

    // The cent-values sum to the total's cent-value exactly.
    const sumCents = Math.round(splits.reduce((sum, s) => sum + s.amount, 0) * 100);
    expect(sumCents).toBe(1999); // 19.99 in cents
  });
});

describe('rescaleSplits', () => {
  it('scales every share proportionally and sums exactly to the new total', () => {
    const out = rescaleSplits([{ categoryId: 'c-a', amount: 100 }, { categoryId: 'c-b', amount: 40 }], 70);

    expect(out.find((s) => s.categoryId === 'c-a')!.amount).toBe(50);
    expect(out.find((s) => s.categoryId === 'c-b')!.amount).toBe(20);
    expect(Math.round(out.reduce((sum, s) => sum + s.amount, 0) * 100)).toBe(7000);
  });

  it('gives the rounding residual to the largest share so the sum stays exact', () => {
    // 3 equal shares scaled to 10 cannot divide evenly.
    const out = rescaleSplits(
      [{ categoryId: 'c-a', amount: 1 }, { categoryId: 'c-b', amount: 1 }, { categoryId: 'c-c', amount: 1 }],
      10,
    );

    expect(Math.round(out.reduce((sum, s) => sum + s.amount, 0) * 100)).toBe(1000);
    // Compared in hundredths, not as a raw float sum: 33.4 + 33.3 + 33.3 is
    // 99.99999999999999 in IEEE-754 even though the values are exactly right.
    expect(Math.round(out.reduce((sum, s) => sum + s.percentage, 0) * 100)).toBe(10000);
  });

  it('keeps a manual split alive when the amount barely moves', () => {
    const out = rescaleSplits([{ categoryId: 'c-a', amount: 150 }, { categoryId: 'c-b', amount: 50 }], 201);

    expect(out).toHaveLength(2);
    expect(Math.round(out.reduce((sum, s) => sum + s.amount, 0) * 100)).toBe(20100);
  });

  it('returns nothing for a non-positive or non-finite total', () => {
    const splits = [{ categoryId: 'c-a', amount: 10 }, { categoryId: 'c-b', amount: 10 }];
    expect(rescaleSplits(splits, 0)).toEqual([]);
    expect(rescaleSplits(splits, Number.NaN)).toEqual([]);
  });

  it('returns nothing when the existing shares sum to zero, since there is no ratio to scale by', () => {
    expect(rescaleSplits([{ categoryId: 'c-a', amount: 0 }, { categoryId: 'c-b', amount: 0 }], 100)).toEqual([]);
  });

  it('returns nothing for an empty set', () => {
    expect(rescaleSplits([], 100)).toEqual([]);
  });

  it('is deterministic for equal shares', () => {
    const args: Array<{ categoryId: string; amount: number }> = [
      { categoryId: 'c-b', amount: 5 },
      { categoryId: 'c-a', amount: 5 },
    ];
    expect(rescaleSplits(args, 10)).toEqual(rescaleSplits([...args].reverse(), 10));
  });
});

describe('buildCategorySplits with a basket-level discount', () => {
  // The receipt that exposed this: Lidl, lines priced BEFORE a 25.00 basket
  // coupon and a total after it. Sum of lines 201.15, total 182.93 — and the
  // 6.78 between them is what the OCR failed to read, not part of the coupon.
  const lidl = (): SplitInputItem[] => [
    item(0, 49.9, 'c-alc', 'Alcohol'),
    item(1, 49.98, 'c-care', 'Health'),
    item(2, 101.27, 'c-food', 'Groceries'),
  ];

  it('refuses without the discount, because the lines then look 10% adrift', () => {
    expect(buildCategorySplits({ items: lidl(), total: 182.93 })).toEqual([]);
  });

  it('splits once the discount explains the gap, still summing exactly', () => {
    const splits = buildCategorySplits({ items: lidl(), total: 182.93, discount: 25 });

    expect(splits).toHaveLength(3);
    expect(splits.reduce((sum, s) => sum + Math.round(s.amount * 100), 0)).toBe(18293);
  });

  it('spreads the known discount proportionally, leaving the unexplained rest on the largest group', () => {
    const byId = new Map(
      buildCategorySplits({ items: lidl(), total: 182.93, discount: 25 }).map((s) => [s.categoryId, s.amount]),
    );

    // Each group carries its own share of the coupon...
    expect(byId.get('c-alc')).toBeCloseTo(43.7, 2);
    expect(byId.get('c-care')).toBeCloseTo(43.77, 2);
    // ...while the 6.78 nobody can account for stays concentrated on the largest
    // group, where it is visible, instead of being smeared across all three.
    expect(byId.get('c-food')).toBeCloseTo(95.46, 2);
  });

  it('ignores a discount that is zero, negative or not a number', () => {
    for (const discount of [0, -5, Number.NaN, null, undefined]) {
      expect(buildCategorySplits({ items: lidl(), total: 182.93, discount })).toEqual([]);
    }
  });

  it('still refuses when the discount does not explain the gap', () => {
    // 5.00 off a 201.15 basket leaves 196.15 against a 150.00 total.
    expect(buildCategorySplits({ items: lidl(), total: 150, discount: 5 })).toEqual([]);
  });

  it('refuses rather than publish a group the discount rounded away to nothing', () => {
    // Half the basket taken off, and one line worth a single cent: its share of
    // the coupon rounds up to that whole cent and the group vanishes.
    const splits = buildCategorySplits({
      items: [item(0, 100, 'c-food', 'Groceries'), item(1, 0.01, 'c-alc', 'Alcohol')],
      total: 50,
      discount: 50.01,
    });

    expect(splits).toEqual([]);
  });

  it('leaves a receipt without a discount exactly as it was', () => {
    const items = [item(0, 180, 'c-food', 'Groceries'), item(1, 60, 'c-alc', 'Alcohol')];

    expect(buildCategorySplits({ items, total: 240, discount: 0 })).toEqual(
      buildCategorySplits({ items, total: 240 }),
    );
  });
});

describe('withDepositGroup', () => {
  const deposit = {
    categoryId: null as any,
    categoryName: 'Kaucja',
    amount: 4.5,
    percentage: 2.2,
    itemIndexes: [] as number[],
  };

  it('appends the deposit untouched and keeps the set summing to the total', () => {
    const manual = buildManualSplits(
      [
        { index: 0, amount: 120, categoryId: 'c-food', categoryName: 'Groceries' },
        { index: 1, amount: 80, categoryId: 'c-beer', categoryName: 'Beer' },
      ],
      200,
    );

    const result = withDepositGroup(manual, deposit, 204.5);

    expect(result.find((s) => s.categoryName === 'Kaucja')?.amount).toBe(4.5);
    expect(result.reduce((sum, s) => sum + Math.round(s.amount * 100), 0)).toBe(20450);
  });

  it('recomputes percentages against the full total, so they still sum to 100', () => {
    const manual = buildManualSplits(
      [{ index: 0, amount: 200, categoryId: 'c-food', categoryName: 'Groceries' }],
      200,
    );

    const result = withDepositGroup(manual, deposit, 204.5);

    expect(result.reduce((sum, s) => sum + s.percentage, 0)).toBeCloseTo(100, 2);
  });

  it('is a no-op when the receipt had no deposit', () => {
    const manual = buildManualSplits(
      [{ index: 0, amount: 200, categoryId: 'c-food', categoryName: 'Groceries' }],
      200,
    );

    expect(withDepositGroup(manual, null, 200)).toBe(manual);
  });
});
