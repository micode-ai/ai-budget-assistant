import type { ScanPriceTagResponse } from '@budget/shared-types';

/** Localized pieces of the note; the caller passes them in so this stays pure. */
export interface PriceTagNoteLabels {
  /** e.g. "regular 4.29 zł" */
  regular: (price: string) => string;
  /** e.g. "promo until 05.10" */
  promoUntil: (date: string) => string;
  /** e.g. "with loyalty card" */
  loyaltyCard: string;
  /** e.g. "price on tag 2.99 EUR" — used when the tag is in another currency. */
  foreignPrice: (price: string) => string;
}

export interface PriceTagFields {
  name: string | null;
  /** Null when unreadable OR in a currency other than the list's. */
  unitPrice: number | null;
  note: string | null;
}

/**
 * Maps a price-tag reading onto the shopping-list item fields. The list is
 * priced in one currency, so a tag in any other currency never becomes the
 * item's price — it is kept in the note instead, where it informs without
 * corrupting the total.
 */
export function priceTagToFields(
  tag: ScanPriceTagResponse,
  listCurrency: string,
  labels: PriceTagNoteLabels,
  formatMoney: (amount: number, currency: string) => string,
): PriceTagFields {
  const sameCurrency = tag.currencyCode == null || tag.currencyCode === listCurrency;
  const noteCurrency = tag.currencyCode ?? listCurrency;
  const parts: string[] = [];
  if (tag.size) parts.push(tag.size);
  if (tag.unitPriceText) parts.push(tag.unitPriceText);
  if (!sameCurrency && tag.price != null) parts.push(labels.foreignPrice(formatMoney(tag.price, noteCurrency)));
  if (tag.regularPrice != null) parts.push(labels.regular(formatMoney(tag.regularPrice, noteCurrency)));
  if (tag.promoUntil) parts.push(labels.promoUntil(tag.promoUntil));
  if (tag.requiresLoyaltyCard) parts.push(labels.loyaltyCard);
  return {
    name: tag.productName,
    unitPrice: sameCurrency ? tag.price : null,
    note: parts.length ? parts.join(' · ') : null,
  };
}

/** True when the reading has nothing usable at all. */
export function isEmptyPriceTag(tag: ScanPriceTagResponse): boolean {
  return tag.productName == null && tag.price == null && tag.size == null && tag.unitPriceText == null;
}
