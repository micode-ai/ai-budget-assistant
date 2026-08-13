import { buildItemCategoryMap } from './receipt-split-items';

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
