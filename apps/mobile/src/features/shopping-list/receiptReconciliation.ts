import { normalizeProductName } from '@budget/shared-utils';
import type { ShoppingListItem } from '@budget/shared-types';

/** The subset of a scanned/edited receipt line this matcher needs. */
export interface ReceiptReconciliationLine {
  description: string;
  canonicalName?: string | null;
}

type MatchableItem = Pick<ShoppingListItem, 'id' | 'canonicalName' | 'rawLabel' | 'isChecked'>;

/**
 * Matches unchecked shopping-list items against a just-saved receipt's line
 * items, so a user who scans the receipt afterward doesn't have to also tick
 * items off by hand (ABA shopping-list-receipt-reconciliation).
 *
 * Conservative on purpose: a false-positive auto-check (marking something
 * bought that wasn't) is more annoying than a missed one, so the bar is an
 * EXACT match after normalization — the same `normalizeProductName` the
 * server's product-category-rule cache already keys on — never a
 * fuzzy/substring match. A shopping-list item added by free-text typing
 * ("milk") that doesn't exactly equal the receipt's printed line or
 * canonical name simply won't match; that is the intended, documented
 * limitation, not a bug — see the module contract.
 *
 * Deliberately does NOT resolve the account's `ProductAlias` renames — that
 * would need a network round trip this offline-capable, client-only check
 * doesn't otherwise need. A renamed product just won't auto-match; the user
 * still checks it off by hand, same as today.
 *
 * Pure: no I/O, no store reads, no clock. Callers pass already-loaded
 * candidates and are expected to have filtered to non-archived lists —
 * already-checked items are skipped here too, defensively, so it is safe to
 * call with an unfiltered `items` array.
 */
export function matchReceiptToShoppingList<T extends MatchableItem>(
  candidates: T[],
  receiptLines: ReceiptReconciliationLine[],
): T[] {
  const receiptKeys = new Set<string>();
  for (const line of receiptLines) {
    const label = line.canonicalName?.trim() || line.description?.trim() || '';
    const key = normalizeProductName(label);
    if (key) receiptKeys.add(key);
  }
  if (receiptKeys.size === 0) return [];

  const matched: T[] = [];
  for (const item of candidates) {
    if (item.isChecked) continue;
    const label = item.canonicalName?.trim() || item.rawLabel?.trim() || '';
    const key = normalizeProductName(label);
    if (key && receiptKeys.has(key)) {
      matched.push(item);
    }
  }
  return matched;
}
