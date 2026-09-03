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
