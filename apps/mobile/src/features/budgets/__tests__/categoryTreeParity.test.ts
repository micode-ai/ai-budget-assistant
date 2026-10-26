import {
  expandAllocatedCategoryIds,
  rollUpAllocationSpend,
  sortCategoriesAsTree,
} from '@budget/shared-utils';

// Mirrors apps/api/src/common/utils/category-tree.spec.ts — the two copies
// must give the same answers.
const P = { id: 'P' };
const C1 = { id: 'C1', parentId: 'P' };
const C2 = { id: 'C2', parentId: 'P', isDeleted: true };
const C3 = { id: 'C3', parentId: 'P' };

describe('category tree parity (shared-utils mirror)', () => {
  it('expands an allocated parent to its live children', () => {
    expect(expandAllocatedCategoryIds(['P'], [P, C1, C2, { id: 'X' }])).toEqual(
      new Set(['P', 'C1']),
    );
  });

  it('rolls child spend into the parent, sorted desc, and keeps a double-allocated child', () => {
    const out = rollUpAllocationSpend(
      new Map([
        ['P', 10],
        ['C1', 5],
        ['C3', 2],
      ]),
      ['P', 'C1'],
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
    expect(out.get('C1')).toEqual({ spent: 5, ownSpent: 5, children: [] });
  });

  it('sorts children after their parent and keeps orphans at depth 0', () => {
    const out = sortCategoriesAsTree([C1, P, C2, { id: 'O', parentId: 'GONE' }]);
    expect(out.map((r) => [r.category.id, r.depth])).toEqual([
      ['P', 0],
      ['C1', 1],
      ['O', 0],
    ]);
  });
});
