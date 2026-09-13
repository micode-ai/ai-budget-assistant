/**
 * Decides what `Content-Type` the guest receipt route may serve, from the
 * stored bytes alone.
 *
 * The stored `Expense.receiptMimeType` is deliberately NOT consulted:
 * `SaveReceiptImageDto.mimeType` is a bare `@IsString()`, so any signed-in user
 * can put any string there, and `GET /s/:token/receipt` is unauthenticated —
 * echoing that string into a `Content-Type` header would let someone store a
 * file and choose how a browser executes it on our own origin. Sniffing the
 * magic bytes takes the choice away from the caller entirely.
 *
 * Unrecognized bytes return `null`, and the route 404s rather than serving them
 * under a guessed type. Serving something we cannot identify is exactly the
 * case worth refusing, and a receipt that reaches this code is always something
 * the OCR pipeline or the picker produced.
 *
 * Production today holds `image/jpeg` (the mobile scan path, downscaled to a
 * 800px JPEG) and `application/pdf` (bank/e-receipt PDFs), plus rows with no
 * stored type at all — which is a second reason not to rely on the column.
 */

/** Signature prefixes, matched at offset 0 only. */
const MAGIC: ReadonlyArray<{ bytes: number[]; type: string }> = [
  { bytes: [0xff, 0xd8, 0xff], type: 'image/jpeg' },
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], type: 'image/png' },
  { bytes: [0x25, 0x50, 0x44, 0x46], type: 'application/pdf' }, // %PDF
  { bytes: [0x47, 0x49, 0x46, 0x38], type: 'image/gif' }, // GIF8
];

/** ISO-BMFF brands that appear at offset 8, right after `ftyp` at offset 4. */
const ISO_BMFF_BRANDS: ReadonlyArray<{ brand: string; type: string }> = [
  { brand: 'heic', type: 'image/heic' },
  { brand: 'heix', type: 'image/heic' },
  { brand: 'heif', type: 'image/heif' },
  { brand: 'mif1', type: 'image/heif' },
];

function startsWith(buffer: Buffer, prefix: number[]): boolean {
  if (buffer.length < prefix.length) return false;
  return prefix.every((byte, index) => buffer[index] === byte);
}

/**
 * @param buffer the stored receipt bytes
 * @param _storedMimeType accepted so call sites read honestly, and ignored on
 *        purpose — see the module docstring. Never remove the parameter in
 *        favour of trusting it.
 */
export function sniffReceiptContentType(buffer: Buffer, _storedMimeType?: string | null): string | null {
  for (const { bytes, type } of MAGIC) {
    if (startsWith(buffer, bytes)) return type;
  }

  // RIFF....WEBP — the 4-byte length between the two markers is not checked.
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }

  // ISO base media (HEIC/HEIF), as produced by an iPhone camera roll.
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12);
    const match = ISO_BMFF_BRANDS.find((entry) => entry.brand === brand);
    if (match) return match.type;
  }

  return null;
}
