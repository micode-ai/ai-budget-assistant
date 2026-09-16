/**
 * Post-processing for OCR'd receipts: some receipts (Polish Biedronka/Lidl/Żabka in
 * particular) print each discount on its own line, and the model sometimes emits those
 * as negative line items ("OPUST PIWO HEINEKEN  -8.00", "Lidl Plus kupon  -6.87")
 * instead of folding them into the receipt-level discount. That clutters the item list,
 * pollutes per-product analytics/search, and double-represents the discount.
 *
 * This util pulls those discount lines OUT of the item list and folds their value into
 * the receipt discount. It deliberately does NOT touch the paid total (`amount` comes
 * from the OCR `total`, independent of the item list), so it can only clean up the
 * item list + the informational discount field — never change what the receipt cost.
 */

// Discount/coupon labels across the languages we see on receipts. Matched only on
// NEGATIVE lines, so a positive product that happens to contain one of these stems
// (e.g. a brand name) is never misclassified.
const DISCOUNT_LABEL =
  /(rabat|opust|upust|zni[żz]k|obni[żz]k|promocj|kupon|coupon|voucher|gutschein|descuento|sconto|remise|скидк|знижк|savings)/i;

export interface DiscountLineItem {
  description?: string | null;
  totalPrice: number;
  lineDiscount?: number;
}

/**
 * A line is a discount line when its amount is negative AND it carries a discount label.
 * The negative-amount gate is the safety net: real products always have a positive price,
 * so nothing legitimate is ever pulled from the list.
 */
export function isDiscountLine(item: DiscountLineItem): boolean {
  if (!(Number(item.totalPrice) < 0)) return false;
  return DISCOUNT_LABEL.test(item.description ?? '');
}

/**
 * Split items into real products (kept) and discount lines (removed), and fold the
 * discount-line amounts into the receipt discount without double-counting: the result
 * discount is the larger of the model's existing discount and the sum of the pulled
 * lines (they normally describe the same money; if the model already summed them into
 * `existingDiscount`, we keep it; if it didn't, the lines restore it).
 */
export function extractReceiptDiscounts<T extends DiscountLineItem>(
  items: T[],
  existingDiscount: number | null,
): { items: T[]; discount: number | null; removedCount: number; basketDiscount: number | null } {
  const products: T[] = [];
  let fromLines = 0;
  let removedCount = 0;
  let basketDiscount = 0;
  const discountLines: { description?: string | null; amount: number }[] = [];

  // First pass: collect discount lines
  for (const it of items) {
    if (isDiscountLine(it)) {
      fromLines += Math.abs(Number(it.totalPrice));
      discountLines.push({ description: it.description, amount: Math.abs(Number(it.totalPrice)) });
      removedCount += 1;
    }
  }

  // Second pass: apply per-line discounts to products by matching description
  // A discount line is assumed to apply to the NEXT non-discount line that contains
  // its description (case-insensitive substring match).
  let discountIdx = 0;
  for (const it of items) {
    if (isDiscountLine(it)) continue;

    // Try to find a matching discount line that hasn't been applied yet
    let matchedDiscount: number | null = null;
    if (discountIdx < discountLines.length) {
      const discountLine = discountLines[discountIdx];
      // Check if discount line description is contained in product description
      // or vice versa (case-insensitive)
      const discountDesc = discountLine.description?.toLowerCase() ?? '';
      const itemDesc = it.description?.toLowerCase() ?? '';
      if (itemDesc.includes(discountDesc) || discountDesc.includes(itemDesc)) {
        matchedDiscount = discountLine.amount;
        discountIdx++;
      }
    }

    // Apply the matched discount (if any) and create a copy with lineDiscount
    if (matchedDiscount !== null) {
      products.push({
        ...it,
        lineDiscount: (it.lineDiscount ?? 0) + matchedDiscount,
      });
    } else {
      products.push({ ...it });
    }
  }

  // Any remaining discount lines are basket-wide discounts
  for (let i = discountIdx; i < discountLines.length; i++) {
    basketDiscount += discountLines[i].amount;
  }

  // Use the larger value between existing discount and basket discount to avoid double-counting
  // (they normally describe the same money; if the model already summed them into `existingDiscount`,
  // we keep it; if it didn't, the lines restore it).
  const finalBasketDiscount =
    basketDiscount > 0
      ? Math.round((Math.max(existingDiscount ?? 0, basketDiscount)) * 100) / 100
      : existingDiscount;

  return { items: products, discount: finalBasketDiscount, removedCount, basketDiscount: finalBasketDiscount };
}
