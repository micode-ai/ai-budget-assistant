import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system/next';

/**
 * Turns a receipt's stored base64 into something <Image>, Sharing and
 * MediaLibrary can all consume, WITHOUT keeping the base64 string alive.
 *
 * Why (ABA memory work): the receipt was rendered as
 * `data:image/jpeg;base64,...`, which meant the whole multi-megabyte string sat
 * in component state for as long as the screen lived, and the 200pt-tall
 * thumbnail decoded a full-resolution bitmap because a data URL gives Fresco no
 * chance to sample it down. Handing it a real file lets it decode straight to
 * the size actually on screen.
 *
 * Web has no working `expo-file-system/next` File (see `utils/fileBase64.ts`),
 * so it keeps the data URL — the memory thresholds this exists for are a Play
 * Store requirement and do not apply there.
 */
export interface MaterializedReceipt {
  /** URI usable by <Image>, Sharing and MediaLibrary. */
  uri: string;
  /** True when `uri` is a real file on disk rather than a data URL. */
  isFile: boolean;
}

/**
 * Bumped on every write so a replaced receipt gets a new path. <Image> caches
 * by URI, so reusing one filename would show the previous photo after a
 * replace.
 */
let revision = 0;

export async function materializeReceipt(
  expenseId: string,
  base64: string,
  mimeType: string,
): Promise<MaterializedReceipt> {
  if (Platform.OS === 'web') {
    return { uri: `data:${mimeType};base64,${base64}`, isFile: false };
  }
  const ext = mimeType === 'application/pdf' ? 'pdf' : 'jpg';
  revision += 1;
  const file = new File(Paths.cache, `receipt-${expenseId}-${revision}.${ext}`);
  file.write(base64, { encoding: 'base64' });
  return { uri: file.uri, isFile: true };
}

/** Best-effort cleanup of a previously materialized file. Never throws. */
export async function releaseReceipt(uri: string | null): Promise<void> {
  if (!uri || Platform.OS === 'web' || !uri.startsWith('file:')) return;
  try {
    new File(uri).delete();
  } catch (e) {
    console.warn('[receiptImageCache] Failed to remove cached receipt:', e);
  }
}
