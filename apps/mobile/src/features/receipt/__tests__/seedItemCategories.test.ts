import { seedItemCategories } from '../seedItemCategories';

const SPLIT = (over: Partial<{ categoryId: string | null; categoryName: string; itemIndexes: number[] }> = {}) => ({
  categoryId: 'c-food',
  categoryName: 'Groceries',
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
    expect(seedItemCategories([], () => undefined)).toEqual({ itemCategories: {}, dropped: false });
    expect(seedItemCategories(undefined, () => undefined)).toEqual({ itemCategories: {}, dropped: false });
  });
});
