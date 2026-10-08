import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { blobToBase64 } from '@/services/fileExport.utils';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/**
 * Turns a downloaded e-mail attachment into a URI the confirm card can render and
 * `compressAndEncodeImage` can read. Web has no file system, so a blob URL; native
 * writes into the app cache. Not a store concern - `expo-file-system` has no web
 * implementation, which is why this lives here and is guarded.
 */
export async function blobToDocumentUri(blob: Blob, itemId: string): Promise<string> {
  if (Platform.OS === 'web') return URL.createObjectURL(blob);
  const ext = EXTENSIONS[blob.type] ?? 'jpg';
  const file = new File(Paths.cache, `inbound-${itemId}.${ext}`);
  file.write(await blobToBase64(blob), { encoding: 'base64' });
  return file.uri;
}

const CACHE_PREFIX = 'inbound-';

const baseName = (uri: string) => decodeURIComponent(uri.split('/').pop() ?? '');

/**
 * Removes the cached attachment of one item (any extension). The file is a copy of someone's
 * receipt in the app cache, so it must not outlive the confirm/dismiss that made it useless.
 * No-op on web (a blob URL is not a file) and never throws.
 */
export function deleteInboundDocumentCache(itemId: string): void {
  if (Platform.OS === 'web') return;
  try {
    for (const entry of new Directory(Paths.cache).list()) {
      if (entry instanceof File && baseName(entry.uri).startsWith(`${CACHE_PREFIX}${itemId}.`)) entry.delete();
    }
  } catch (e) {
    console.warn('[inboundMail] cached document cleanup failed:', e);
  }
}

/** Removes every cached inbound attachment (store reset / sign-out). No-op on web, never throws. */
export function clearInboundDocumentCache(): void {
  if (Platform.OS === 'web') return;
  try {
    for (const entry of new Directory(Paths.cache).list()) {
      if (entry instanceof File && baseName(entry.uri).startsWith(CACHE_PREFIX)) entry.delete();
    }
  } catch (e) {
    console.warn('[inboundMail] cached document cleanup failed:', e);
  }
}
