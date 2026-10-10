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
 * The secondary line under a scanned receipt line on the confirm card —
 * `2 × 3,49 zł`, `0.437 × 12,99 zł` for a weighed line, or `×2` when OCR read
 * a quantity but no unit price. Mirrors the saved expense's item row
 * (`ExpenseItemsSection`), so the count reads the same before and after
 * saving. `null` when OCR returned no usable quantity — nothing to show.
 * Rounds to 3 dp to scrub float noise from weighed quantities.
 */
export function formatItemQuantityLine(
  quantity: number | undefined,
  unitPrice: number | undefined,
  formatMoney: (amount: number) => string,
): string | null {
  if (quantity == null || !Number.isFinite(quantity) || quantity <= 0) return null;
  const qty = Math.round(quantity * 1000) / 1000;
  if (unitPrice == null || !Number.isFinite(unitPrice)) return `×${qty}`;
  return `${qty} × ${formatMoney(unitPrice)}`;
}
