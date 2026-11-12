import { BadRequestException } from '@nestjs/common';
import type { ReceiptImagePart } from '@budget/shared-types';
import { RECEIPT_PART_MIME_TYPES } from '../ai/utils/sanitize';

/**
 * A long receipt is stored as part 1 on `Expense.receiptImage` and parts 2..N
 * in `expense_receipt_parts` (index 2..4). These are the limits every write of
 * a part goes through — the create DTO, `PUT /expenses/:id/receipt-parts`, and
 * the service itself (the sync handler builds its dto by spreading a client
 * payload, so class-validator is not the only door).
 */
export const RECEIPT_PARTS_MAX_TOTAL = 4;
/** Parts 2..N carried next to `receiptImageBase64` on a create. */
export const RECEIPT_EXTRA_PARTS_MAX = RECEIPT_PARTS_MAX_TOTAL - 1;
/**
 * Per-part cap on the decoded image. A single receipt image has no cap of its
 * own beyond the 50 MB JSON body; 8 MB is the API's existing receipt-image cap
 * (`inbound-mail.config.ts` `MAX_IMAGE_BYTES`). A downscaled part is ~1 MB.
 */
export const RECEIPT_PART_MAX_BYTES = 8 * 1024 * 1024;
/** The same cap on the base64 string (4 chars per 3 bytes). */
export const RECEIPT_PART_MAX_BASE64_CHARS = Math.ceil(RECEIPT_PART_MAX_BYTES / 3) * 4;

export { RECEIPT_PART_MIME_TYPES };

export interface StoredReceiptPart {
  image: Buffer;
  mimeType: string;
}

/** `image/jpg` is not a registered type; store `image/jpeg`. */
function normalizeMime(mime: unknown): string {
  const m = (typeof mime === 'string' && mime ? mime : 'image/jpeg').toLowerCase();
  return m === 'image/jpg' ? 'image/jpeg' : m;
}

/**
 * Validates and decodes receipt parts, in order. Throws 400 with a stable code:
 * `parts_count`, `parts_empty`, `parts_mime` (a PDF included), `parts_size`.
 */
export function decodeReceiptParts(parts: unknown, min: number, max: number): StoredReceiptPart[] {
  if (!Array.isArray(parts) || parts.length < min || parts.length > max) {
    throw new BadRequestException('parts_count');
  }
  return parts.map((raw) => {
    const p = raw as Partial<ReceiptImagePart> | null;
    if (!p || typeof p.imageBase64 !== 'string' || p.imageBase64.length === 0) {
      throw new BadRequestException('parts_empty');
    }
    const mimeType = normalizeMime(p.mimeType);
    if (!RECEIPT_PART_MIME_TYPES.includes(mimeType)) throw new BadRequestException('parts_mime');
    if (p.imageBase64.length > RECEIPT_PART_MAX_BASE64_CHARS) throw new BadRequestException('parts_size');
    const image = Buffer.from(p.imageBase64, 'base64');
    if (image.length === 0) throw new BadRequestException('parts_empty');
    return { image, mimeType };
  });
}
