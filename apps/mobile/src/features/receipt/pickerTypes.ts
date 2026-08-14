import { Platform } from 'react-native';

/**
 * What the "PDF" button is allowed to pick.
 *
 * On web `expo-document-picker` sets this string verbatim as the `accept`
 * attribute of a file input, and the OS — not the browser — decides which files
 * match, by looking up the file's EXTENSION in its own registry. It never reads
 * the file. So a genuine PDF whose extension the system does not map to
 * `application/pdf` (no extension, a double extension, a file handed over by a
 * cloud provider) is shown in the dialog, thumbnail and all, yet cannot be
 * selected. Adding the bare `.pdf` extension token gives the dialog a second way
 * to recognise it.
 *
 * `image/*` is here because a shop's "PDF receipt" is frequently an exported
 * photo: the Biedronka export that did reach us carried 28 characters of text
 * across two pages, i.e. no text layer at all — a picture in a PDF wrapper. A
 * user holding the picture version of that same receipt should not be told the
 * file does not exist.
 *
 * Native keeps the single MIME type: `.pdf` is not a MIME type, and Android and
 * iOS resolve this value through their own type systems rather than an `accept`
 * attribute.
 */
export const PICKER_TYPES: string | string[] =
  Platform.OS === 'web' ? ['application/pdf', '.pdf', 'image/*'] : 'application/pdf';

/**
 * Whether a picked asset should be treated as a PDF.
 *
 * The MIME type is authoritative when present. It is not always present: the web
 * asset carries whatever `File.type` the browser derived from the extension,
 * which is an empty string for a file the OS could not classify — exactly the
 * case the `.pdf` token above exists to admit. The filename is the fallback, and
 * only then.
 */
export function isPdfAsset(mimeType?: string | null, name?: string | null): boolean {
  if (mimeType) return mimeType.toLowerCase() === 'application/pdf';
  return !!name && name.toLowerCase().endsWith('.pdf');
}
