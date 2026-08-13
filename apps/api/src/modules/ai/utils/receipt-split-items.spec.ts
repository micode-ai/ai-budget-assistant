import { buildItemCategoryMap, resolveProposedSplits } from './receipt-split-items';

describe('buildItemCategoryMap', () => {
  it('maps every line index of every split to its category id', () => {
    const map = buildItemCategoryMap([
      { categoryId: 'c-food', itemIndexes: [0, 2] },
      { categoryId: 'c-alc', itemIndexes: [1] },
    ]);

    expect(map.get(0)).toBe('c-food');
    expect(map.get(1)).toBe('c-alc');
    expect(map.get(2)).toBe('c-food');
    expect(map.size).toBe(3);
  });

  it('skips a split that has no category id yet, without dropping the others', () => {
    const map = buildItemCategoryMap([
      { categoryId: null, itemIndexes: [0] },
      { categoryId: 'c-food', itemIndexes: [1] },
    ]);

    expect(map.has(0)).toBe(false);
    expect(map.get(1)).toBe('c-food');
  });

  it('returns an empty map for an empty or undefined split list', () => {
    expect(buildItemCategoryMap([]).size).toBe(0);
    expect(buildItemCategoryMap(undefined).size).toBe(0);
  });
});

describe('resolveProposedSplits', () => {
  it('creates a category for a proposal and substitutes its id', async () => {
    const createCategory = jest.fn().mockResolvedValue({ id: 'c-new' });

    const resolved = await resolveProposedSplits(
      [
        { categoryId: 'c-food', categoryName: 'Groceries', amount: 20, percentage: 66.67, itemIndexes: [0] },
        { categoryId: null, categoryName: 'Chemia', amount: 10, percentage: 33.33, itemIndexes: [1] },
      ],
      createCategory,
    );

    expect(createCategory).toHaveBeenCalledTimes(1);
    expect(createCategory).toHaveBeenCalledWith('Chemia');
    expect(resolved.map((s) => s.categoryId)).toEqual(['c-food', 'c-new']);
    expect(resolved.reduce((sum, s) => sum + s.amount, 0)).toBeCloseTo(30, 2);
  });

  it('creates one category even when two groups share a proposed name', async () => {
    const createCategory = jest.fn().mockResolvedValue({ id: 'c-new' });

    await resolveProposedSplits(
      [
        { categoryId: null, categoryName: 'Chemia', amount: 5, percentage: 50, itemIndexes: [0] },
        { categoryId: null, categoryName: 'Chemia', amount: 5, percentage: 50, itemIndexes: [1] },
      ],
      createCategory,
    );

    expect(createCategory).toHaveBeenCalledTimes(1);
  });
});
