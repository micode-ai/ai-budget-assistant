import { buildParentOf, normalizeCategoryKeys } from '../buildParentOf';

const cats = [
  { id: 'G', name: 'Groceries', parentId: null },
  { id: 'P', name: 'Produce', parentId: 'G' },
  { id: 'D', name: 'Dead', parentId: null, isDeleted: true },
  { id: 'O', name: 'Orphan', parentId: 'D' },
  { id: 'T', name: 'Third', parentId: 'P' },
  { id: 'S', name: 'Self', parentId: 'S' },
];

describe('buildParentOf', () => {
  const parentOf = buildParentOf(cats);

  it('live top-level parent returns its id', () => {
    expect(parentOf('P')).toBe('G');
  });

  it('deleted parent returns null', () => {
    expect(parentOf('O')).toBeNull();
  });

  it('parent that itself has a parent returns null', () => {
    expect(parentOf('T')).toBeNull();
  });

  it('self-parent returns null', () => {
    expect(parentOf('S')).toBeNull();
  });

  it('unknown key returns null', () => {
    expect(parentOf('nope')).toBeNull();
  });

  it('top-level row returns null', () => {
    expect(parentOf('G')).toBeNull();
  });

  it('legacy name key resolves as before', () => {
    expect(parentOf('Produce')).toBe('G');
  });
});

describe('normalizeCategoryKeys', () => {
  const m = (e: [string | null, number][]) => new Map<string | null, number>(e);

  it('re-keys a legacy name to the category id, merging with id-keyed spend', () => {
    const out = normalizeCategoryKeys(m([['G', 10], ['Groceries', 5], [null, 2], ['unknown', 1]]), cats);
    expect([...out.entries()].sort()).toEqual(
      [['G', 15], [null, 2], ['unknown', 1]].sort(),
    );
  });

  it('keeps an id key even when it also matches some name', () => {
    const out = normalizeCategoryKeys(m([['P', 3]]), [...cats, { id: 'X', name: 'P' }]);
    expect(out.get('P')).toBe(3);
    expect(out.has('X')).toBe(false);
  });
});
