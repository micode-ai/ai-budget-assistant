import { resolveNextFocusedRow } from '../rowKeyboardNav';

describe('resolveNextFocusedRow', () => {
  it('returns null for an empty order regardless of direction', () => {
    expect(resolveNextFocusedRow([], null, 1)).toBeNull();
    expect(resolveNextFocusedRow([], 'a', -1)).toBeNull();
  });

  it('with no current cursor, "down" lands on the first row', () => {
    expect(resolveNextFocusedRow(['a', 'b', 'c'], null, 1)).toBe('a');
  });

  it('with no current cursor, "up" lands on the last row', () => {
    expect(resolveNextFocusedRow(['a', 'b', 'c'], null, -1)).toBe('c');
  });

  it('moves the cursor forward one step', () => {
    expect(resolveNextFocusedRow(['a', 'b', 'c'], 'a', 1)).toBe('b');
    expect(resolveNextFocusedRow(['a', 'b', 'c'], 'b', 1)).toBe('c');
  });

  it('moves the cursor backward one step', () => {
    expect(resolveNextFocusedRow(['a', 'b', 'c'], 'c', -1)).toBe('b');
    expect(resolveNextFocusedRow(['a', 'b', 'c'], 'b', -1)).toBe('a');
  });

  it('never wraps past the last row', () => {
    expect(resolveNextFocusedRow(['a', 'b', 'c'], 'c', 1)).toBe('c');
  });

  it('never wraps past the first row', () => {
    expect(resolveNextFocusedRow(['a', 'b', 'c'], 'a', -1)).toBe('a');
  });

  it('falls back to first/last when the current cursor is no longer in order (a facet narrowed it out)', () => {
    expect(resolveNextFocusedRow(['a', 'b', 'c'], 'gone', 1)).toBe('a');
    expect(resolveNextFocusedRow(['a', 'b', 'c'], 'gone', -1)).toBe('c');
  });

  it('handles a single-row order without throwing', () => {
    expect(resolveNextFocusedRow(['only'], null, 1)).toBe('only');
    expect(resolveNextFocusedRow(['only'], 'only', 1)).toBe('only');
    expect(resolveNextFocusedRow(['only'], 'only', -1)).toBe('only');
  });
});
