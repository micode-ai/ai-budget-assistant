import type { ImportRow } from '@budget/shared-types';

/**
 * Rewrites every row's `currencyCode` to `override` — the mechanism behind
 * the assumed-currency correction banner (see `previewNotices.ts`). A `null`
 * override is the no-correction state and returns the input array
 * unchanged, by reference, so a caller can pass this straight into a
 * `useMemo` dependency chain without a spurious identity change when nothing
 * was actually overridden.
 *
 * `idx` — and every other field — travels through untouched. `idx` is what
 * the preview screen's `selected: Set<number>` keys off; a rewrite that
 * dropped or renumbered it would silently desync the checkboxes from the
 * rows they are supposed to control.
 */
export function applyCurrencyOverride(rows: ImportRow[], override: string | null): ImportRow[] {
  if (!override) return rows;
  return rows.map((r) => ({ ...r, currencyCode: override }));
}
