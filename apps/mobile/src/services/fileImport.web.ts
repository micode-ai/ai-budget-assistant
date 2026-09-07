import type { FileReadResult } from './fileImport.utils';

export { parseBackupFile } from './fileImport.utils';
export type { FileReadResult, BackupParseResult } from './fileImport.utils';

/**
 * Reads a file the user picked, in a browser.
 *
 * **This file must never import `expo-file-system`, and that is the whole
 * point of it existing.** That package's new `File` / `Directory` / `Paths`
 * API has no web implementation: its web module defines `FileSystemFile` as a
 * class whose constructor only `console.warn`s and which carries no methods,
 * while the real `File` constructor calls `this.validatePath()` — so
 * `new File(uri)` throws `TypeError: this.validatePath is not a function`
 * before it has read a byte. `fileExport.web.ts` exists for the same reason on
 * the way out; this is the fourth call site of that defect and the first on the
 * way in, which is why the read direction now has its own platform split
 * instead of a `Platform.OS` branch someone can forget.
 *
 * A browser needs none of it. A document-picker `uri` on web is a `blob:` URL
 * (`URL.createObjectURL` over the picked `File`), and `fetch` reads one.
 */
export async function readTextFile(uri: string): Promise<FileReadResult> {
  try {
    const response = await fetch(uri);
    return { status: 'ok', text: await response.text() };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'Failed to read the file' };
  }
}
