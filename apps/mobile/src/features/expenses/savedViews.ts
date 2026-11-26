/**
 * Saved transaction views (ABA saved-transaction-filters): pure model.
 *
 * A view is a snapshot of the filters the transactions screen already has.
 * Period is stored RELATIVE ('month', never a fixed month) so "restaurants
 * this month" stays this month next month. A 'custom' period (a fixed month)
 * is deliberately not captured: `period: null` means "leave the period alone".
 * Amount range and tags are NOT serialized: no such filter exists on the
 * screen today, so a view cannot store what the UI cannot express.
 */
export type SavedViewPeriod = 'week' | 'month' | 'year' | 'all';
export type SavedViewKind = 'all' | 'expenses' | 'income';

export interface SavedView {
  id: string;
  name: string;
  kind: SavedViewKind;
  period: SavedViewPeriod | null;
  query: string;
  /** Category ids; may contain the uncategorized sentinel. Phone applies the first only. */
  categoryIds: string[];
  merchants: string[];
  createdAt: string;
}

export type SavedViewSnapshot = Omit<SavedView, 'id' | 'name' | 'createdAt'>;

export interface ScreenFilterState {
  kind: SavedViewKind;
  dateRange: 'week' | 'month' | 'year' | 'all' | 'custom';
  searchQuery: string;
  categoryIds: string[];
  merchants: string[];
}

const RELATIVE_PERIODS: readonly string[] = ['week', 'month', 'year', 'all'];

export function captureView(state: ScreenFilterState): SavedViewSnapshot {
  return {
    kind: state.kind,
    period: RELATIVE_PERIODS.includes(state.dateRange) ? (state.dateRange as SavedViewPeriod) : null,
    query: state.searchQuery.trim(),
    categoryIds: [...state.categoryIds],
    merchants: [...state.merchants],
  };
}

/** True when the snapshot narrows nothing beyond the neutral state — not worth saving. */
export function isEmptyView(s: SavedViewSnapshot): boolean {
  return (
    s.kind === 'all' &&
    (s.period === null || s.period === 'all') &&
    s.query === '' &&
    s.categoryIds.length === 0 &&
    s.merchants.length === 0
  );
}

/**
 * Does the live screen state equal this view? Drives the "active chip" highlight.
 * Categories/merchants compare as sets; a null period matches any period.
 */
export function viewMatches(view: SavedView, state: ScreenFilterState): boolean {
  const cur = captureView(state);
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  return (
    view.kind === cur.kind &&
    (view.period === null || view.period === cur.period) &&
    view.query.toLowerCase() === cur.query.toLowerCase() &&
    sameSet(view.categoryIds, cur.categoryIds) &&
    sameSet(view.merchants, cur.merchants)
  );
}

/** Drop references to categories that no longer exist so a stale id cannot silently empty the list. */
export function resolveView(view: SavedView, knownCategoryIds: ReadonlySet<string>, sentinel: string): SavedView {
  return {
    ...view,
    categoryIds: view.categoryIds.filter((id) => id === sentinel || knownCategoryIds.has(id)),
  };
}

/** Validates persisted JSON; tolerant of garbage so a bad blob never crashes the screen. */
export function parseStoredViews(raw: string | undefined): SavedView[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((v) => v && typeof v.id === 'string' && typeof v.name === 'string')
      .map((v) => ({
        id: v.id,
        name: v.name,
        kind: v.kind === 'expenses' || v.kind === 'income' ? v.kind : 'all',
        period: RELATIVE_PERIODS.includes(v.period) ? v.period : null,
        query: typeof v.query === 'string' ? v.query : '',
        categoryIds: Array.isArray(v.categoryIds) ? v.categoryIds.filter((x: unknown) => typeof x === 'string') : [],
        merchants: Array.isArray(v.merchants) ? v.merchants.filter((x: unknown) => typeof x === 'string') : [],
        createdAt: typeof v.createdAt === 'string' ? v.createdAt : new Date(0).toISOString(),
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}
