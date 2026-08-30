/**
 * Width caps for receipt photos, and the pure rule that decides whether a given
 * photo needs resizing at all.
 *
 * Why this exists (ABA memory work): the OCR path used to base64-encode the
 * camera's full-sensor JPEG (a 12 MP shot is 3-6 MB, and base64 adds a third on
 * top) and hand that string to the API layer, which copies it again into the
 * request body. That transient peak is exactly what Google Play's dynamic
 * memory (anonymous RSS + swap) threshold measures, and the same full-res URI
 * was also handed to <Image> for the preview, decoding a full-size bitmap for a
 * few hundred points of screen.
 */

/**
 * Cap for the copy sent to the OCR endpoint. The vision model downsamples to
 * roughly 2048px on its longest side anyway, so anything above this is paid for
 * in memory and upload time and then thrown away server-side. Receipts are
 * narrow and tall, so capping the WIDTH keeps the small print legible.
 */
export const RECEIPT_OCR_MAX_WIDTH = 1600;

/** Cap for the copy persisted with the expense — only ever viewed in-app. */
export const RECEIPT_STORED_MAX_WIDTH = 800;

/**
 * Returns the width to resize to, or `null` when the image should be passed
 * through untouched.
 *
 * An unknown width (the document-picker path hands us a file with no reported
 * dimensions) resizes rather than passes through: guessing wrong on a small
 * image costs a modest upscale, guessing wrong on a 12 MP one costs tens of
 * megabytes, so the memory-safe default wins.
 */
export function resolveResizeWidth(
  sourceWidth: number | undefined | null,
  maxWidth: number,
): number | null {
  const known = typeof sourceWidth === 'number' && Number.isFinite(sourceWidth) && sourceWidth > 0;
  if (known && (sourceWidth as number) <= maxWidth) return null;
  return maxWidth;
}
