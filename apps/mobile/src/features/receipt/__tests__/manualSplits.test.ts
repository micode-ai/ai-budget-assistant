import { buildManualSplits, type ManualSplitItem } from '../manualSplits';

const line = (index: number, amount: number, categoryId: string | null, categoryName = categoryId): ManualSplitItem => ({
  index,
  amount,
  categoryId,
  categoryName,
});

describe('buildManualSplits', () => {
  it('publishes the split even when the lines do not reconcile with the total', () => {
    // The Lidl receipt that exposed this: the OCR over-read the basket by 17.62,
    // so the automatic path refused. The user assigned the lines anyway, and
    // their work must not be thrown away for the model's bad arithmetic.
    const splits = buildManualSplits(
      [line(0, 52.68, 'c-alc', 'Alcohol'), line(1, 113.02, 'c-food', 'Groceries')],
      121.78,
    );

    expect(splits).toHaveLength(2);
    expect(splits.reduce((cents, s) => cents + Math.round(s.amount * 100), 0)).toBe(12178);
  });

  it('keeps each category in proportion to what was assigned to it', () => {
    const splits = buildManualSplits([line(0, 25, 'c-a'), line(1, 75, 'c-b')], 200);
    const byId = new Map(splits.map((s) => [s.categoryId, s.amount]));

    expect(byId.get('c-a')).toBeCloseTo(50, 2);
    expect(byId.get('c-b')).toBeCloseTo(150, 2);
  });

  it('sums to the total exactly when the proportions do not divide evenly', () => {
    const splits = buildManualSplits([line(0, 1, 'c-a'), line(1, 1, 'c-b'), line(2, 1, 'c-c')], 10);

    expect(splits.reduce((cents, s) => cents + Math.round(s.amount * 100), 0)).toBe(1000);
    expect(splits.reduce((sum, s) => sum + s.percentage, 0)).toBeCloseTo(100, 2);
  });

  it('groups every line of a category together and remembers which lines they were', () => {
    const splits = buildManualSplits(
      [line(0, 10, 'c-a'), line(1, 30, 'c-b'), line(2, 10, 'c-a')],
      50,
    );
    const a = splits.find((s) => s.categoryId === 'c-a');

    expect(a?.itemIndexes).toEqual([0, 2]);
    expect(a?.amount).toBeCloseTo(20, 2);
  });

  it('ignores unassigned lines rather than inventing a category for them', () => {
    const splits = buildManualSplits(
      [line(0, 40, 'c-a'), line(1, 40, 'c-b'), line(2, 20, null, null)],
      100,
    );

    expect(splits).toHaveLength(2);
    // The unassigned 20 is still part of the receipt, so the assigned pair is
    // scaled up to cover the whole total rather than leaving it unaccounted.
    expect(splits.reduce((cents, s) => cents + Math.round(s.amount * 100), 0)).toBe(10000);
  });

  it('refuses when only one category was assigned, since that is not a split', () => {
    expect(buildManualSplits([line(0, 10, 'c-a'), line(1, 30, 'c-a')], 40)).toEqual([]);
  });

  it('refuses a non-positive or unusable total', () => {
    const items = [line(0, 10, 'c-a'), line(1, 30, 'c-b')];

    expect(buildManualSplits(items, 0)).toEqual([]);
    expect(buildManualSplits(items, Number.NaN)).toEqual([]);
  });

  it('ignores lines with no usable amount', () => {
    const splits = buildManualSplits(
      [line(0, 10, 'c-a'), line(1, 30, 'c-b'), line(2, Number.NaN, 'c-c'), line(3, -5, 'c-d')],
      40,
    );

    expect(splits.map((s) => s.categoryId).sort()).toEqual(['c-a', 'c-b']);
  });

  it('is deterministic for equal shares', () => {
    const items = [line(0, 10, 'c-b'), line(1, 10, 'c-a')];

    expect(buildManualSplits(items, 20)).toEqual(buildManualSplits([...items].reverse(), 20));
  });
});
