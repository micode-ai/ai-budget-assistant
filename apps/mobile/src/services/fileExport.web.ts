import { mimeTypeForFileName, type FileExportResult } from './fileExport.utils';

export type { FileExportResult } from './fileExport.utils';

/**
 * Browser file export.
 *
 * `expo-file-system`'s new `File` / `Directory` / `Paths` API has **no web
 * implementation at all**: its web module (`ExpoFileSystem.web.ts`) defines
 * `FileSystemFile` as a class whose constructor only `console.warn`s, with no
 * methods on it. `File`'s own constructor then calls `this.validatePath()`, so
 * `new File(Paths.cache, name)` throws `TypeError: this.validatePath is not a
 * function` — which is exactly what pressing "Generate report" in the web app
 * used to produce. `expo-sharing` is equally absent here.
 *
 * A browser does not need either: handing the user a file means triggering a
 * download, which is also what they expect from a web app.
 */
function triggerDownload(blob: Blob, fileName: string): FileExportResult {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    return { status: 'error', error: 'Downloads are not available in this browser' };
  }

  // Re-wrap so the download carries a sensible type even if the response did not.
  const typed = blob.type ? blob : new Blob([blob], { type: mimeTypeForFileName(fileName) });
  const url = URL.createObjectURL(typed);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return { status: 'saved', location: fileName };
  } finally {
    // Safari needs the URL to outlive the click; a task turn is enough.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

export async function saveFile(blob: Blob, fileName: string): Promise<FileExportResult> {
  return triggerDownload(blob, fileName);
}

/** There is no share sheet in a browser — a download is the honest equivalent. */
export async function shareFile(blob: Blob, fileName: string): Promise<FileExportResult> {
  return triggerDownload(blob, fileName);
}
