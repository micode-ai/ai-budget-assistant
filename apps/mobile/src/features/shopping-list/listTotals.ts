import type { ShoppingListItem } from '@budget/shared-types';

type PricedItem = Pick<ShoppingListItem, 'quantity' | 'unitPrice' | 'isChecked'>;

export interface ShoppingListTotals {
  /** Sum of price × quantity over every priced item. */
  total: number;
  /** Same, over unchecked items only — what is still to be paid. */
  remaining: number;
  /** Items with no price, so the caller can say the total is partial. */
  unpricedCount: number;
  /** False when no item has a price — nothing to show. */
  hasAnyPrice: boolean;
}

/** Rounds to cents so a sum of 0.1 + 0.2 reads as 0.3, not 0.30000000000000004. */
function toCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Line total for one item, or null when it has no price. */
export function lineTotal(item: Pick<ShoppingListItem, 'quantity' | 'unitPrice'>): number | null {
  if (item.unitPrice == null) return null;
  return toCents(item.unitPrice * item.quantity);
}

/**
 * Totals for one list. Pure — every item is priced in the account currency, so
 * the figures are plain sums with no conversion.
 */
export function computeShoppingListTotals(items: PricedItem[]): ShoppingListTotals {
  let total = 0;
  let remaining = 0;
  let unpricedCount = 0;
  let hasAnyPrice = false;
  for (const item of items) {
    const line = lineTotal(item);
    if (line == null) {
      unpricedCount++;
      continue;
    }
    hasAnyPrice = true;
    total += line;
    if (!item.isChecked) remaining += line;
  }
  return { total: toCents(total), remaining: toCents(remaining), unpricedCount, hasAnyPrice };
}

/**
 * Parses what the user typed into the price field. Accepts a comma or a dot as
 * the decimal separator. Returns null for an empty field (clears the price) and
 * undefined for input that is not a valid non-negative amount.
 */
export function parsePriceInput(value: string): number | null | undefined {
  const trimmed = value.trim().replace(/\s/g, '');
  if (trimmed === '') return null;
  if (!/^\d+([.,]\d{0,2})?$/.test(trimmed)) return undefined;
  const n = parseFloat(trimmed.replace(',', '.'));
  return Number.isFinite(n) ? toCents(n) : undefined;
}
