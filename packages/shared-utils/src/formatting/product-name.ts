/**
 * Mirror of the API's canonical `normalizeProductName`
 * (`apps/api/src/modules/merchant-rules/product-rules.service.ts`) — same
 * "deliberately duplicated pair" convention as `financial-month.ts`/
 * `wallet-currencies.ts`: the API has no build step and cannot import this
 * package at runtime, so the two copies must be kept identical by hand.
 *
 * The mobile client uses this copy to match a shopping-list item's name
 * against a scanned receipt's line items entirely on-device, using the SAME
 * normalization the server already teaches product-category rules with
 * (ABA shopping-list-receipt-reconciliation) — everything that is not a
 * letter or a digit is layout, not identity. See the API copy's doc comment
 * for the full rationale (an OCR-dropped diacritic, the printer's erratic
 * spacing, and a decimal comma vs. a dot must all normalize to the same key,
 * or a repeat product silently never matches).
 */
export function normalizeProductName(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}
