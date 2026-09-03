import { reindexAfterRemoval } from '../itemEditing';

describe('reindexAfterRemoval', () => {
  it('drops the removed index and shifts every key above it down by one', () => {
    const itemCategories = { 0: 'cat-a', 1: 'cat-b', 2: 'cat-c', 3: 'cat-d' };
    expect(reindexAfterRemoval(itemCategories, 1)).toEqual({
      0: 'cat-a',
      1: 'cat-c',
      2: 'cat-d',
    });
  });

  it('leaves keys below the removed index untouched', () => {
    const itemCategories = { 0: 'cat-a', 2: 'cat-c' };
    expect(reindexAfterRemoval(itemCategories, 2)).toEqual({ 0: 'cat-a' });
  });

  it('removing the last item only drops its own key', () => {
    const itemCategories = { 0: 'cat-a', 1: 'cat-b' };
    expect(reindexAfterRemoval(itemCategories, 1)).toEqual({ 0: 'cat-a' });
  });

  it('removing index 0 shifts every remaining key down by one', () => {
    const itemCategories = { 0: 'cat-a', 1: 'cat-b', 2: 'cat-c' };
    expect(reindexAfterRemoval(itemCategories, 0)).toEqual({ 0: 'cat-b', 1: 'cat-c' });
  });

  it('preserves null category values (unassigned lines)', () => {
    const itemCategories = { 0: null, 1: 'cat-b', 2: null };
    expect(reindexAfterRemoval(itemCategories, 0)).toEqual({ 0: 'cat-b', 1: null });
  });

  it('handles an empty map', () => {
    expect(reindexAfterRemoval({}, 0)).toEqual({});
  });

  it('removing an index with no entry only shifts higher keys', () => {
    const itemCategories = { 0: 'cat-a', 2: 'cat-c' };
    expect(reindexAfterRemoval(itemCategories, 1)).toEqual({ 0: 'cat-a', 1: 'cat-c' });
  });
});
