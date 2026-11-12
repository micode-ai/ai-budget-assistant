import type { ReceiptImagePart } from '@budget/shared-types';
import { receiptTotalsReconcile } from '@budget/shared-utils';

/**
 * Long receipt in several photos — the pure half. A part is a photo of one
 * section of ONE receipt, top to bottom, already downscaled through
 * `receiptImage.ts` (so `uri` is a small file the thumbnails can render).
 * The API accepts 2–4 parts in one scan; one part is an ordinary scan.
 */
export const MAX_RECEIPT_PARTS = 4;

export interface ScanPart {
  /** File URI of the downscaled photo — never a data: URL. */
  uri: string;
}

/** Appends a part; refuses beyond `MAX_RECEIPT_PARTS` (returns the same array). */
export function addPart(parts: ScanPart[], p: ScanPart): ScanPart[] {
  return parts.length >= MAX_RECEIPT_PARTS ? parts : [...parts, p];
}

/** Appends several parts in order, dropping whatever does not fit. */
export function addParts(parts: ScanPart[], ps: ScanPart[]): ScanPart[] {
  return ps.reduce(addPart, parts);
}

export function removePart(parts: ScanPart[], index: number): ScanPart[] {
  if (index < 0 || index >= parts.length) return parts;
  return parts.filter((_, i) => i !== index);
}

export function canScan(parts: ScanPart[]): boolean {
  return parts.length >= 1;
}

export function remainingParts(parts: ScanPart[]): number {
  return Math.max(0, MAX_RECEIPT_PARTS - parts.length);
}

/**
 * The duplicate pre-check's input for a scan: the API fingerprints a
 * multi-part scan as SHA-256 over all parts' base64 concatenated in order
 * (`receiptFingerprintParts`), and one part is just that part.
 */
export function partsFingerprintInput(base64Parts: string[]): string {
  return base64Parts.join('');
}

export interface PartsScanDeps<R> {
  scanReceipt: (imageBase64: string, userPrompt?: string) => Promise<R>;
  scanReceiptParts: (parts: ReceiptImagePart[], userPrompt?: string) => Promise<R>;
}

/**
 * ONE scan for the whole receipt: one part goes through today's single-image
 * request unchanged; 2–4 parts go through `images` in order. Every part is a
 * JPEG, because the downscale re-encodes it as one.
 */
export async function scanEncodedParts<R>(
  base64Parts: string[],
  userPrompt: string | undefined,
  deps: PartsScanDeps<R>,
): Promise<R> {
  if (base64Parts.length < 1 || base64Parts.length > MAX_RECEIPT_PARTS) {
    throw new Error(`A receipt scan takes 1-${MAX_RECEIPT_PARTS} parts, got ${base64Parts.length}`);
  }
  if (base64Parts.length === 1) return deps.scanReceipt(base64Parts[0], userPrompt);
  return deps.scanReceiptParts(
    base64Parts.map((imageBase64) => ({ imageBase64, mimeType: 'image/jpeg' })),
    userPrompt,
  );
}

/**
 * The receipt fields of an expense create. Parts ALWAYS travel with part 1:
 * the API reads a create carrying `receiptImageBase64` without
 * `receiptImageParts` as "the receipt is now this one image" and deletes any
 * stored parts, and it refuses parts without an image. So there is no way to
 * send parts on their own, and nothing ever sends part 1 now and parts later.
 */
export function buildReceiptImageFields(
  part1: string | undefined,
  rest: ReceiptImagePart[] | undefined,
  part1MimeType?: string,
): { receiptImageBase64?: string; receiptMimeType?: string; receiptImageParts?: ReceiptImagePart[] } {
  if (!part1) return {};
  const extra = (rest ?? []).slice(0, MAX_RECEIPT_PARTS - 1);
  return {
    receiptImageBase64: part1,
    ...(part1MimeType ? { receiptMimeType: part1MimeType } : {}),
    ...(extra.length > 0 ? { receiptImageParts: extra } : {}),
  };
}

/** The scan-response fields the reconciliation reads. */
export interface ReconcilableScan {
  amount: number;
  discountAmount?: number | null;
  depositAmount?: number | null;
  receiptItems?: { totalPrice: number; lineDiscount?: number }[];
}

/**
 * A receipt read from 2+ photos whose lines do not add up to its total — the
 * likely sign of parts in the wrong order, a missing middle, or a second
 * receipt. Same arithmetic as the server's attestation gate
 * (`receiptTotalsReconcile`: net line prices, basket discount, deposit,
 * 5 % tolerance). A single photo is never flagged: its flow is unchanged.
 */
export function partsTotalsMismatch(partsCount: number, receipt: ReconcilableScan | null | undefined): boolean {
  if (partsCount < 2 || !receipt) return false;
  return !receiptTotalsReconcile({
    items: (receipt.receiptItems ?? []).map((i) => ({ amount: Number(i.totalPrice), lineDiscount: i.lineDiscount })),
    total: receipt.amount,
    discount: receipt.discountAmount,
    deposit: receipt.depositAmount,
  });
}

/** "Retake parts": the scanner state with no parts and no result. */
export function retakeState() {
  return {
    parts: [] as ScanPart[],
    isProcessing: false,
    error: null,
    errorStatus: null,
    imageUri: null,
    isPdf: false,
    scannedReceipt: null,
  };
}
