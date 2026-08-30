import * as ImageManipulator from 'expo-image-manipulator';
import { uriToBase64 } from '@/utils/fileBase64';
import {
  resolveResizeWidth,
  RECEIPT_OCR_MAX_WIDTH,
  RECEIPT_STORED_MAX_WIDTH,
} from './receiptImageSizing';

export { RECEIPT_OCR_MAX_WIDTH, RECEIPT_STORED_MAX_WIDTH };

/**
 * Re-encodes a receipt photo as JPEG, resizing it first when it is wider than
 * `maxWidth`. The manipulation runs even when no resize is needed: the pickers
 * can hand back HEIC on iOS, and re-encoding normalizes the format and applies
 * the compression the caller asked for.
 */
async function toJpeg(
  uri: string,
  maxWidth: number,
  compress: number,
  sourceWidth?: number,
): Promise<string> {
  const width = resolveResizeWidth(sourceWidth, maxWidth);
  const actions = width === null ? [] : [{ resize: { width } }];
  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}

/**
 * Shrinks a freshly captured photo before it is base64-encoded for the OCR
 * request AND before it is handed to <Image> as the on-screen preview.
 *
 * Never throws: a failed downscale falls back to the original URI, because a
 * scan that works but uses more memory beats a scan that does not work at all.
 */
export async function downscaleForOcr(uri: string, sourceWidth?: number): Promise<string> {
  try {
    return await toJpeg(uri, RECEIPT_OCR_MAX_WIDTH, 0.7, sourceWidth);
  } catch (e) {
    console.warn('[receiptImage] OCR downscale failed, using the original image:', e);
    return uri;
  }
}

/**
 * Compresses a receipt photo and returns it as a base64 string, ready to attach
 * to the expense when the "save image" checkbox is on. This copy is only ever
 * viewed in-app, so it is capped tighter than the OCR copy.
 */
export async function compressAndEncodeImage(uri: string, sourceWidth?: number): Promise<string> {
  const small = await toJpeg(uri, RECEIPT_STORED_MAX_WIDTH, 0.6, sourceWidth);
  return await uriToBase64(small);
}
