import { reindexAfterRemoval, formatItemQuantityLine } from '../itemEditing';

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

describe('formatItemQuantityLine', () => {
  const money = (n: number) => `${n.toFixed(2)} zł`;

  it('shows quantity × unit price', () => {
    expect(formatItemQuantityLine(2, 3.49, money)).toBe('2 × 3.49 zł');
  });

  it('shows a single unit too, matching the saved expense row', () => {
    expect(formatItemQuantityLine(1, 5, money)).toBe('1 × 5.00 zł');
  });

  it('scrubs float noise from a weighed quantity', () => {
    expect(formatItemQuantityLine(0.43700000001, 12.99, money)).toBe('0.437 × 12.99 zł');
  });

  it('shows just the count when OCR read no unit price', () => {
    expect(formatItemQuantityLine(3, undefined, money)).toBe('×3');
  });

  it('treats a stored 0 unit price as unread, not as a real price', () => {
    expect(formatItemQuantityLine(2, 0, money)).toBe('×2');
  });

  it('shows nothing for quantity 1 without a unit price', () => {
    expect(formatItemQuantityLine(1, 0, money)).toBeNull();
    expect(formatItemQuantityLine(1, undefined, money)).toBeNull();
  });

  it('accepts Decimal values serialized as strings', () => {
    expect(formatItemQuantityLine('2.000', '3.49', money)).toBe('2 × 3.49 zł');
  });

  it('returns null when there is no usable quantity', () => {
    expect(formatItemQuantityLine(undefined, 3, money)).toBeNull();
    expect(formatItemQuantityLine(0, 3, money)).toBeNull();
    expect(formatItemQuantityLine(NaN, 3, money)).toBeNull();
  });
});
