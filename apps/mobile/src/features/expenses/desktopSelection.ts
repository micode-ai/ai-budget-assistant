/**
 * Pure selection-bookkeeping for the desktop transactions table (Task 6).
 * Lives apart from `TransactionTable.tsx`/`ExpensesDesktop.tsx` for the same
 * reason `desktopTable.ts` does — nothing in this repo renders a component
 * in CI, so this is the only place a mistake in either of these two rules
 * can be caught before a human sees it.
 */

export type HeaderCheckState = 'checked' | 'unchecked' | 'indeterminate';

/**
 * The desktop table's header checkbox is tri-state. It must be derived from
 * the currently VISIBLE, selectable ids — never from the selection alone —
 * or it could claim `'checked'` for a selection that includes rows a facet
 * has since hidden (the same invariant that keeps the header from ever
 * calling `selectAll`; see the constraint on `useExpenseMultiSelect`).
 */
export function computeHeaderCheckState(visibleIds: string[], selectedIds: Set<string>): HeaderCheckState {
  if (visibleIds.length === 0) return 'unchecked';
  const selectedCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  if (selectedCount === 0) return 'unchecked';
  return selectedCount === visibleIds.length ? 'checked' : 'indeterminate';
}

/**
 * Drops any selected id that's no longer in `visibleIds` — the response to a
 * facet narrowing underneath an active selection. A bulk action (in
 * particular delete) must never reach a row the user can no longer see, so
 * this is applied whenever the visible set changes, not just at the moment
 * of the bulk action itself.
 *
 * Returns `null`, not a same-contents array, when nothing needed trimming —
 * so a caller can skip the state update (and the render it would cause) on
 * every facet change that doesn't actually touch the current selection,
 * rather than comparing sizes itself.
 */
export function trimToVisible(selectedIds: Set<string>, visibleIds: string[]): string[] | null {
  if (selectedIds.size === 0) return null;
  const visible = new Set(visibleIds);
  const next: string[] = [];
  let dropped = false;
  for (const id of selectedIds) {
    if (visible.has(id)) {
      next.push(id);
    } else {
      dropped = true;
    }
  }
  return dropped ? next : null;
}
