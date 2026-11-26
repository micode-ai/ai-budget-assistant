import { captureView, isEmptyView, viewMatches, resolveView, parseStoredViews, type SavedView, type ScreenFilterState } from '../savedViews';

const base: ScreenFilterState = { kind: 'expenses', dateRange: 'month', searchQuery: ' pizza ', categoryIds: ['c1'], merchants: [] };
const mk = (s: Partial<SavedView> = {}): SavedView => ({ id: '1', name: 'n', createdAt: '2026-01-01', ...captureView(base), ...s });

describe('savedViews', () => {
  it('captures period relatively and trims query', () => {
    expect(captureView(base)).toMatchObject({ period: 'month', query: 'pizza' });
  });
  it('does not capture a custom (fixed) period', () => {
    expect(captureView({ ...base, dateRange: 'custom' }).period).toBeNull();
  });
  it('detects an empty view', () => {
    expect(isEmptyView(captureView({ kind: 'all', dateRange: 'all', searchQuery: '', categoryIds: [], merchants: [] }))).toBe(true);
    expect(isEmptyView(captureView(base))).toBe(false);
  });
  it('matches live state, ignoring case and order; null period matches any', () => {
    expect(viewMatches(mk(), base)).toBe(true);
    expect(viewMatches(mk({ query: 'PIZZA' }), base)).toBe(true);
    expect(viewMatches(mk({ period: null }), { ...base, dateRange: 'year' })).toBe(true);
    expect(viewMatches(mk(), { ...base, dateRange: 'year' })).toBe(false);
  });
  it('drops unknown categories but keeps the sentinel', () => {
    const v = resolveView(mk({ categoryIds: ['c1', 'gone', '__none__'] }), new Set(['c1']), '__none__');
    expect(v.categoryIds).toEqual(['c1', '__none__']);
  });
  it('parses garbage safely', () => {
    expect(parseStoredViews('nope')).toEqual([]);
    expect(parseStoredViews('{"a":1}')).toEqual([]);
    expect(parseStoredViews(JSON.stringify([{ id: 'a', name: 'x', period: 'bogus' }]))[0]).toMatchObject({ period: null, kind: 'all' });
  });
});
