/**
 * Platform-free helpers shared by `fileExport.native.ts` and `fileExport.web.ts`.
 *
 * Nothing here may touch `expo-file-system`, `expo-sharing` or the DOM — both
 * platform implementations import this module.
 */

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  json: 'application/json',
  txt: 'text/plain',
};

export const FALLBACK_MIME_TYPE = 'application/octet-stream';

/** Guessed from the extension; unknown or extension-less names fall back. */
export function mimeTypeForFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return FALLBACK_MIME_TYPE;
  const ext = fileName.slice(dot + 1).toLowerCase();
  return MIME_BY_EXTENSION[ext] || FALLBACK_MIME_TYPE;
}

/**
 * Was this the user backing out of the system folder picker, rather than a real
 * failure? Expo's Android module throws `PickerCancelledException`, whose coded
 * error reaches JS as `ERR_PICKER_CANCELLED`. The message is checked too so a
 * rename of that code does not turn a cancellation back into a "failure" —
 * which is the branch that pops a share sheet the user did not ask for.
 */
export function isPickerCancelled(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string' && code.toUpperCase().includes('CANCEL')) return true;
  const message = (err as { message?: unknown }).message;
  return typeof message === 'string' && /cancel/i.test(message);
}

/** Blob -> bare base64 (no `data:` prefix). `FileReader` exists on both platforms. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

/** Blob -> text. */
export function blobToText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsText(blob);
  });
}

export type FileExportResult =
  /** Written to a location the user picked (Android SAF) or the browser's downloads. */
  | { status: 'saved'; location: string }
  /** Handed to the system share sheet — the only route out on iOS. */
  | { status: 'shared' }
  /** The user backed out of the folder picker. Say nothing, do nothing. */
  | { status: 'cancelled' }
  | { status: 'error'; error: string };
