import { seedItemCategories, seedLineCategories, type SeedableSplit } from '../seedItemCategories';

const SPLIT = (over: Partial<SeedableSplit> = {}): SeedableSplit => ({
  categoryId: 'c-food',
  categoryName: 'Groceries',
  amount: 100,
  percentage: 100,
  itemIndexes: [0],
  ...over,
});

describe('seedItemCategories', () => {
  it('maps a resolved split to its local category id', () => {
    const result = seedItemCategories([SPLIT({ itemIndexes: [0, 2] })], () => 'local-food');

    expect(result.itemCategories).toEqual({ 0: 'local-food', 2: 'local-food' });
    expect(result.dropped).toBe(false);
  });

  it('holds an unresolvable proposal under a sentinel instead of dropping the set', () => {
    const result = seedItemCategories(
      [SPLIT(), SPLIT({ categoryId: null, categoryName: 'Chemia', itemIndexes: [1] })],
      (split) => (split.categoryId ? 'local-food' : undefined),
    );

    expect(result.itemCategories).toEqual({ 0: 'local-food', 1: 'new:Chemia' });
    expect(result.dropped).toBe(false);
  });

  it('prefers a real category the account has acquired since the scan', () => {
    const result = seedItemCategories(
      [SPLIT({ categoryId: null, categoryName: 'Chemia', itemIndexes: [1] })],
      () => 'local-chemia',
    );

    expect(result.itemCategories).toEqual({ 1: 'local-chemia' });
  });

  it('drops the whole set when a real split cannot be resolved', () => {
    const result = seedItemCategories([SPLIT(), SPLIT({ categoryId: 'c-gone', itemIndexes: [1] })], (split) =>
      split.categoryId === 'c-food' ? 'local-food' : undefined,
    );

    expect(result.itemCategories).toEqual({});
    expect(result.dropped).toBe(true);
  });

  it('treats an empty or absent split list as nothing to seed', () => {
    expect(seedItemCategories([], () => undefined)).toEqual({ itemCategories: {}, dropped: false, splits: [] });
    expect(seedItemCategories(undefined, () => undefined)).toEqual({
      itemCategories: {},
      dropped: false,
      splits: [],
    });
  });

  describe('the split it hands the screen to display', () => {
    it("returns the server's own amounts, under locally addressable category ids", () => {
      const result = seedItemCategories(
        [
          SPLIT({ amount: 95.46, percentage: 52.18, itemIndexes: [0, 1] }),
          SPLIT({ categoryId: 'c-care', categoryName: 'Health', amount: 87.47, percentage: 47.82, itemIndexes: [2] }),
        ],
        (split) => (split.categoryId === 'c-food' ? 'local-food' : 'local-care'),
      );

      expect(result.splits).toEqual([
        {
          categoryId: 'local-food',
          categoryName: 'Groceries',
          amount: 95.46,
          percentage: 52.18,
          itemIndexes: [0, 1],
        },
        { categoryId: 'local-care', categoryName: 'Health', amount: 87.47, percentage: 47.82, itemIndexes: [2] },
      ]);
    });

    it('addresses a proposal by its sentinel, so the chip can mark it and save can create it', () => {
      const result = seedItemCategories(
        [SPLIT({ categoryId: null, categoryName: 'Chemia', amount: 40, percentage: 40 })],
        () => undefined,
      );

      expect(result.splits).toEqual([
        { categoryId: 'new:Chemia', categoryName: 'Chemia', amount: 40, percentage: 40, itemIndexes: [0] },
      ]);
    });

    it('hands back nothing when the set was dropped, so no partial split is ever shown', () => {
      const result = seedItemCategories([SPLIT(), SPLIT({ categoryId: 'c-gone', itemIndexes: [1] })], (split) =>
        split.categoryId === 'c-food' ? 'local-food' : undefined,
      );

      expect(result.dropped).toBe(true);
      expect(result.splits).toEqual([]);
    });
  });
});

describe('seedLineCategories', () => {
  const classified = (categoryId?: string | null, categoryName?: string | null) => ({ categoryId, categoryName });

  it('maps each line to its own local category', () => {
    const map = seedLineCategories(
      [classified('c-food', 'Groceries'), classified('c-alc', 'Alcohol')],
      (line) => (line.categoryId === 'c-food' ? 'local-food' : 'local-alc'),
    );

    expect(map).toEqual({ 0: 'local-food', 1: 'local-alc' });
  });

  it('keeps the lines it CAN resolve when one of them fails', () => {
    // Unlike the split, a line's category is a claim about that line alone —
    // one bad match must not cost the user the other fourteen.
    const map = seedLineCategories(
      [classified('c-food', 'Groceries'), classified('c-gone', 'Deleted'), classified('c-alc', 'Alcohol')],
      (line) => (line.categoryId === 'c-gone' ? undefined : `local-${line.categoryId}`),
    );

    expect(map).toEqual({ 0: 'local-c-food', 2: 'local-c-alc' });
  });

  it('holds a proposal under its sentinel', () => {
    const map = seedLineCategories([classified(null, 'Chemia')], () => undefined);

    expect(map).toEqual({ 0: 'new:Chemia' });
  });

  it('skips a line the server never classified', () => {
    expect(seedLineCategories([classified(null, null), classified(undefined, undefined)], () => 'x')).toEqual({});
    expect(seedLineCategories(undefined, () => 'x')).toEqual({});
  });
});
