import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  blobToBase64,
  blobToText,
  isPickerCancelled,
  mimeTypeForFileName,
  type FileExportResult,
} from './fileExport.utils';

export type { FileExportResult } from './fileExport.utils';

/** Writes the blob into the app cache and returns the `file://` URI. */
async function writeToCache(blob: Blob, fileName: string): Promise<string> {
  const base64 = await blobToBase64(blob);
  const file = new File(Paths.cache, fileName);
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}

/** System share sheet. On iOS this is the only route a file has out of the app. */
export async function shareFile(blob: Blob, fileName: string): Promise<FileExportResult> {
  try {
    const uri = await writeToCache(blob, fileName);
    if (!(await Sharing.isAvailableAsync())) {
      return { status: 'error', error: 'Sharing is not available on this device' };
    }
    await Sharing.shareAsync(uri, { mimeType: mimeTypeForFileName(fileName), dialogTitle: fileName });
    return { status: 'shared' };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'Failed to share file' };
  }
}

/**
 * Puts the file somewhere the user chooses.
 *
 * Android has a real folder picker (SAF), so it saves there and reports the path.
 * A **cancelled** picker returns `cancelled` and nothing else happens — popping a
 * share sheet at someone who just backed out of "where shall I save this" is how
 * "it doesn't export, it offers to forward" happened. A genuine write failure
 * still falls through to the share sheet, so the file is never simply lost.
 *
 * iOS has no equivalent picker, so saving *is* the share sheet ("Save to Files").
 */
export async function saveFile(blob: Blob, fileName: string): Promise<FileExportResult> {
  const mimeType = mimeTypeForFileName(fileName);

  if (Platform.OS === 'android') {
    try {
      const dir = await Directory.pickDirectoryAsync();
      const destFile = dir.createFile(fileName, mimeType);

      if (mimeType === 'text/csv' || mimeType === 'application/json') {
        destFile.write(await blobToText(blob));
      } else {
        const binary = atob(await blobToBase64(blob));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        destFile.write(bytes);
      }

      let location = fileName;
      try {
        location = `${decodeURIComponent(dir.uri)}/${fileName}`;
      } catch {
        // Keep the bare file name if the SAF URI cannot be decoded.
      }
      return { status: 'saved', location };
    } catch (err) {
      if (isPickerCancelled(err)) return { status: 'cancelled' };
      // Fall through: the user asked for the file, so still offer a way out.
    }
  }

  return shareFile(blob, fileName);
}
