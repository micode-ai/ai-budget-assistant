import {
  expandAllocatedCategoryIds,
  rollUpAllocationSpend,
  sortCategoriesAsTree,
} from './category-tree';

const P = { id: 'P' };
const C1 = { id: 'C1', parentId: 'P' };
const C2 = { id: 'C2', parentId: 'P', isDeleted: true };
const C3 = { id: 'C3', parentId: 'P' };

describe('expandAllocatedCategoryIds', () => {
  it('adds live children of an allocated parent and skips deleted ones', () => {
    const out = expandAllocatedCategoryIds(['P'], [P, C1, C2, { id: 'X' }]);
    expect(out).toEqual(new Set(['P', 'C1']));
  });

  it('keeps an allocated child when its parent is not allocated', () => {
    const out = expandAllocatedCategoryIds(['C1'], [P, C1, C3]);
    expect(out).toEqual(new Set(['C1']));
  });
});

describe('rollUpAllocationSpend', () => {
  it('rolls child spend into the parent, children sorted by spent desc', () => {
    const out = rollUpAllocationSpend(
      new Map([
        ['P', 10],
        ['C1', 5],
        ['C3', 2],
      ]),
      ['P'],
      [P, C3, C1],
    );
    expect(out.get('P')).toEqual({
      spent: 17,
      ownSpent: 10,
      children: [
        { categoryId: 'C1', spent: 5 },
        { categoryId: 'C3', spent: 2 },
      ],
    });
  });

  it('counts a child under both its own and its parent allocation', () => {
    const out = rollUpAllocationSpend(
      new Map([
        ['P', 10],
        ['C1', 5],
      ]),
      ['P', 'C1'],
      [P, C1],
    );
    expect(out.get('P')?.spent).toBe(15);
    expect(out.get('C1')).toEqual({ spent: 5, ownSpent: 5, children: [] });
  });

  it('includes a child moved under an allocated parent', () => {
    const byCategory = new Map([
      ['P', 10],
      ['C1', 5],
    ]);
    expect(rollUpAllocationSpend(byCategory, ['P'], [P, { id: 'C1' }]).get('P')?.spent).toBe(10);
    expect(rollUpAllocationSpend(byCategory, ['P'], [P, C1]).get('P')?.spent).toBe(15);
  });

  it('omits children with zero spend', () => {
    const out = rollUpAllocationSpend(new Map([['P', 1]]), ['P'], [P, C1]);
    expect(out.get('P')?.children).toEqual([]);
  });
});

describe('sortCategoriesAsTree', () => {
  it('places live children after their parent and keeps top-level order', () => {
    const out = sortCategoriesAsTree([
      { id: 'A' },
      C1,
      P,
      { id: 'B', parentId: 'A' },
      C2,
      { id: 'O', parentId: 'GONE' },
      { id: 'D', parentId: 'DEL' },
      { id: 'DEL', isDeleted: true },
    ]);
    expect(out.map((r) => [r.category.id, r.depth])).toEqual([
      ['A', 0],
      ['B', 1],
      ['P', 0],
      ['C1', 1],
      ['O', 0],
      ['D', 0],
    ]);
  });
});
