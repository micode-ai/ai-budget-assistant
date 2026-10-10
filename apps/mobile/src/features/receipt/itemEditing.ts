/**
 * Reindexes the receipt-line category map after `items[removedIndex]` is
 * deleted (ABA receipt-line-item-editing) — every key equal to the removed
 * index is dropped, every key above it shifts down by one so it keeps
 * pointing at the same (now shifted) item. Pure so `handleRemoveItem`
 * (`useReceiptCategorySplit`) can pair it with `setItems` in the same
 * function without either state update observing a stale index pairing.
 */
export function reindexAfterRemoval(
  itemCategories: Record<number, string | null>,
  removedIndex: number,
): Record<number, string | null> {
  const next: Record<number, string | null> = {};
  for (const [key, value] of Object.entries(itemCategories)) {
    const index = Number(key);
    if (index === removedIndex) continue;
    next[index > removedIndex ? index - 1 : index] = value;
  }
  return next;
}

/**
 * The secondary line under a receipt line — `2 × 3,49 zł`, `0.437 × 12,99 zł`
 * for a weighed line, or `×2` when there is no unit price. Used by both the
 * confirm card (`ReceiptItemsEditor`) and the saved expense's item row
 * (`ExpenseItemsSection`), so the count reads the same before and after saving.
 *
 * A unit price of 0 counts as missing: the API stores an unread unit price as
 * 0 (`unitPrice ?? 0`), so a saved row can't tell "OCR didn't read it" from a
 * real zero — and a real 0.00 unit price never reaches a positive total.
 * Without a unit price, quantity 1 says nothing and returns `null`, as does a
 * missing quantity. Accepts strings because Prisma `Decimal`s arrive as JSON
 * strings. Rounds to 3 dp to scrub float noise from weighed quantities.
 */
export function formatItemQuantityLine(
  quantity: number | string | null | undefined,
  unitPrice: number | string | null | undefined,
  formatMoney: (amount: number) => string,
): string | null {
  const q = quantity == null || quantity === '' ? NaN : Number(quantity);
  if (!Number.isFinite(q) || q <= 0) return null;
  const qty = Math.round(q * 1000) / 1000;
  const price = unitPrice == null || unitPrice === '' ? NaN : Number(unitPrice);
  if (!Number.isFinite(price) || price <= 0) return qty === 1 ? null : `×${qty}`;
  return `${qty} × ${formatMoney(price)}`;
}
