import type { ExpenseItem } from '@budget/shared-types';

export interface SplitModeResult {
  mode: 'items' | 'equal';
  /** True when real line items exist locally but haven't round-tripped
   * through the server yet — distinct from "this receipt genuinely has no
   * line items", so the screen can show a "still syncing" hint instead of
   * the "no line items" one. */
  hasUnsyncedItems: boolean;
}

/**
 * Decides whether `app/expense/split.tsx` can offer item-level assignment for
 * a receipt, pure and unit-tested (mirrors `validateSplit.ts` alongside it).
 *
 * Only items that round-tripped through the server (via the pull merge, or
 * the server-fetch fallback in `expenseStore.loadExpenseItems`) carry the
 * REAL `expense_item` id `receipt-split.service.ts` validates `itemIds`
 * against — see `ExpenseItem.syncStatus`. An item created moments ago by a
 * receipt scan is cached locally under a locally-generated id the server
 * never learned; submitting that id would 400 (`Item <id> does not belong to
 * this expense`). Requiring EVERY item synced — never a partial mix — means
 * an unsynced receipt degrades to a whole-bill equal split, a safe and
 * correct request, instead of a failed one.
 */
export function deriveSplitMode(items: ExpenseItem[]): SplitModeResult {
  const allSynced = items.length > 0 && items.every((i) => i.syncStatus === 'synced');
  return {
    mode: allSynced ? 'items' : 'equal',
    hasUnsyncedItems: items.length > 0 && !allSynced,
  };
}
