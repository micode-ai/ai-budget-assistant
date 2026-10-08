import type { ReceiptDuplicateMatch, InboundReceiptDetail } from '@budget/shared-types';
import type { ReceiptItem, ScannedReceipt, ReceiptCategorySplitItem } from '@/features/receipt/useReceiptScanner';

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Maps a stored e-mail extraction (the server's `ReceiptExpense` minus
 * `possibleDuplicate`, as JSON) onto the scanner's `ScannedReceipt`, so the existing
 * confirm card and save path run unchanged. The duplicate match comes from the
 * detail, where the server recomputed it at read time - never from the stored JSON.
 *
 * Returns `null` when there is no usable extraction (no positive total), so the
 * caller shows an error instead of an empty card.
 */
export function mapInboundToScanned(detail: InboundReceiptDetail): ScannedReceipt | null {
  const x = detail.extraction;
  if (!x) return null;
  const amount = num(x.amount) ?? detail.total;
  if (amount == null || !(amount > 0)) return null;

  const receiptItems = Array.isArray(x.receiptItems) ? (x.receiptItems as ReceiptItem[]) : [];
  const categorySplits = Array.isArray(x.categorySplits)
    ? (x.categorySplits as ReceiptCategorySplitItem[])
    : [];

  return {
    amount,
    discountAmount: num(x.discountAmount),
    depositAmount: num(x.depositAmount),
    currencyCode: str(x.currencyCode) ?? detail.currencyCode ?? 'PLN',
    description: str(x.description) ?? detail.subject ?? '',
    categoryId: str(x.categoryId),
    categorySuggestion: str(x.categorySuggestion),
    merchant: str(x.merchant) ?? detail.merchant,
    date: str(x.date) ?? detail.date,
    confidence: num(x.confidence) ?? 0,
    receiptItems,
    location: (x.location as ScannedReceipt['location']) ?? null,
    priceFindings: Array.isArray(x.priceFindings) ? (x.priceFindings as ScannedReceipt['priceFindings']) : undefined,
    categorySplits,
    fingerprint: str(x.fingerprint) ?? undefined,
    possibleDuplicate: (detail.possibleDuplicate as ReceiptDuplicateMatch | null) ?? null,
  };
}

/**
 * The scanner state a seeded item produces. Only an image document is shown (and
 * offered for storage); a PDF or text body has no preview and, as with
 * share-to-capture, `useReceiptSave` attaches no file for either - so both read as
 * `isPdf` to hide the preview and the "save image" checkbox.
 */
export function inboundScannerState(detail: InboundReceiptDetail, documentUri: string | null) {
  const isImage = detail.documentKind === 'image' && !!documentUri;
  return {
    isProcessing: false,
    error: null,
    imageUri: isImage ? documentUri : null,
    isPdf: !isImage,
    scannedReceipt: mapInboundToScanned(detail),
    errorStatus: null,
  };
}
