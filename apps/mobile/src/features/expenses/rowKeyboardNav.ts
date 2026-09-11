/**
 * Pure row-cursor logic for `TransactionTable`'s `↑`/`↓` keyboard navigation.
 *
 * Kept apart from the component for the same reason `desktopTable.ts` and
 * `desktopSelection.ts` are: nothing in this repo renders a component in CI,
 * so this is the only place a mistake in "which row does the cursor land on
 * next" can be caught before a human sees it.
 */

/**
 * Move the keyboard row cursor one step through `order` (the table's own
 * rendered id order — day-grouped, then sorted, exactly the list
 * `rangeBetween` for shift-click already uses).
 *
 * - No current cursor: `down` lands on the first row, `up` on the last —
 *   pressing either arrow from a cold start always lands somewhere useful.
 * - Cursor no longer present in `order` (the active filters changed under
 *   it): same first/last fallback, rather than silently doing nothing.
 * - **Never wraps.** Stopping at either end is the ordinary list-navigation
 *   convention (Explorer/Finder/Sheets); wrapping from the last row back to
 *   the first is surprising in a ledger a user is reading top-to-bottom.
 */
export function resolveNextFocusedRow(
  order: string[],
  currentId: string | null,
  direction: 1 | -1
): string | null {
  if (order.length === 0) return null;

  if (currentId === null) {
    return direction === 1 ? order[0] : order[order.length - 1];
  }

  const index = order.indexOf(currentId);
  if (index === -1) {
    return direction === 1 ? order[0] : order[order.length - 1];
  }

  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= order.length) return order[index];
  return order[nextIndex];
}
