import { computeHeaderCheckState, trimToVisible } from '../desktopSelection';

describe('computeHeaderCheckState', () => {
  it('is unchecked when nothing is selectable at all', () => {
    expect(computeHeaderCheckState([], new Set())).toBe('unchecked');
  });

  it('is unchecked when rows are visible but none are selected', () => {
    expect(computeHeaderCheckState(['a', 'b'], new Set())).toBe('unchecked');
  });

  it('is checked only when every visible id is selected', () => {
    expect(computeHeaderCheckState(['a', 'b'], new Set(['a', 'b']))).toBe('checked');
  });

  it('is indeterminate when some but not all visible ids are selected', () => {
    expect(computeHeaderCheckState(['a', 'b', 'c'], new Set(['a']))).toBe('indeterminate');
  });

  it('never counts a selected id the caller did not list as visible', () => {
    // A selection can (deliberately, momentarily, before the trim effect
    // runs) contain an id a facet just hid — the header must not read that
    // as "checked" just because it happens to equal the visible count.
    expect(computeHeaderCheckState(['a'], new Set(['a', 'ghost']))).toBe('checked');
    expect(computeHeaderCheckState(['a', 'b'], new Set(['ghost']))).toBe('unchecked');
  });
});

describe('trimToVisible', () => {
  it('returns null when the selection is empty', () => {
    expect(trimToVisible(new Set(), ['a', 'b'])).toBeNull();
  });

  it('returns null when every selected id is still visible', () => {
    expect(trimToVisible(new Set(['a', 'b']), ['a', 'b', 'c'])).toBeNull();
  });

  it('drops ids that are no longer visible, keeping the rest', () => {
    expect(trimToVisible(new Set(['a', 'b', 'c']), ['b'])).toEqual(['b']);
  });

  it('returns an empty array, not null, when nothing selected remains visible', () => {
    expect(trimToVisible(new Set(['a', 'b']), [])).toEqual([]);
  });
});
