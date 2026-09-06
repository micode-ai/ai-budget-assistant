import { File } from 'expo-file-system';
import type { FileReadResult } from './fileImport.utils';

export { parseBackupFile } from './fileImport.utils';
export type { FileReadResult, BackupParseResult } from './fileImport.utils';

/**
 * Reads a file the user picked, on a phone.
 *
 * This is the call the data settings screen already made inline and which has
 * always worked here; it is lifted rather than changed, so native behaviour is
 * byte-identical. The only difference is that a failure now comes back as a
 * result instead of an exception, which is what lets the caller tell "could not
 * read it" apart from "read it, and it is not a backup".
 */
export async function readTextFile(uri: string): Promise<FileReadResult> {
  try {
    const file = new File(uri);
    return { status: 'ok', text: await file.text() };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'Failed to read the file' };
  }
}
