import { normalizeProductName } from '@budget/shared-utils';
import type { ProductListItem, ShoppingListItem } from '@budget/shared-types';

/** The subset of a scanned/edited receipt line this matcher needs. */
export interface ReceiptReconciliationLine {
  description: string;
  canonicalName?: string | null;
}

type MatchableItem = Pick<ShoppingListItem, 'id' | 'canonicalName' | 'rawLabel' | 'isChecked'>;

/**
 * Builds a `rawName -> canonicalName` lookup (matching `ProductAlias`'s own
 * two columns) from whatever `ProductListItem[]` is already loaded — every
 * item's `rawNames` are the raw, pre-alias names that resolve to its
 * `canonicalName`. Pure, no I/O — the caller decides where the products
 * came from (shopping-list-alias-aware-reconciliation).
 *
 * An identity entry (`rawNames[0] === canonicalName`, the common no-alias
 * case) is left in the map rather than filtered out — a wasted lookup hit,
 * never a wrong one, and filtering it would cost a branch to save nothing.
 */
export function buildProductAliasMap(products: ProductListItem[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const product of products) {
    for (const raw of product.rawNames) {
      map.set(raw, product.canonicalName);
    }
  }
  return map;
}

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
 * Alias-aware, best-effort (shopping-list-alias-aware-reconciliation): the
 * optional `aliasMap` (build one with `buildProductAliasMap`) resolves a
 * receipt line's raw `canonicalName` through the account's known
 * `ProductAlias` renames/merges before matching — OCR invents a fresh
 * canonicalName per scan, so without this a renamed/merged product (Settings
 * -> Products) silently stops auto-matching on every later receipt. This is
 * deliberately opportunistic: the caller passes whatever alias data already
 * happens to be loaded in memory this session (see `shoppingListStore`) —
 * when `aliasMap` is omitted or has no entry for a line, behavior is
 * byte-identical to before. No network round trip is made here or by any
 * caller of this function; a rename made on another device, or not yet
 * loaded this session, simply won't resolve until the next time that data is
 * fetched elsewhere in the app. The shopping-list item side of the match
 * needs no resolution — see the module contract for why.
 *
 * Pure: no I/O, no store reads, no clock. Callers pass already-loaded
 * candidates and are expected to have filtered to non-archived lists —
 * already-checked items are skipped here too, defensively, so it is safe to
 * call with an unfiltered `items` array.
 */
export function matchReceiptToShoppingList<T extends MatchableItem>(
  candidates: T[],
  receiptLines: ReceiptReconciliationLine[],
  aliasMap?: ReadonlyMap<string, string>,
): T[] {
  const receiptKeys = new Set<string>();
  for (const line of receiptLines) {
    const rawCanonical = line.canonicalName?.trim() || undefined;
    const resolved = rawCanonical ? aliasMap?.get(rawCanonical) ?? rawCanonical : undefined;
    const label = resolved || line.description?.trim() || '';
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
