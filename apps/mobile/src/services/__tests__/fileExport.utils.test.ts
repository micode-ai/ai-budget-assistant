import {
  FALLBACK_MIME_TYPE,
  isPickerCancelled,
  mimeTypeForFileName,
} from '../fileExport.utils';

describe('mimeTypeForFileName', () => {
  it('resolves the three report formats', () => {
    expect(mimeTypeForFileName('raport-2026-08.pdf')).toBe('application/pdf');
    expect(mimeTypeForFileName('raport-2026-08.csv')).toBe('text/csv');
    expect(mimeTypeForFileName('raport-2026-08.xlsx')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  it('resolves a backup', () => {
    expect(mimeTypeForFileName('backup_2026-08-17.json')).toBe('application/json');
  });

  it('is case-insensitive about the extension', () => {
    expect(mimeTypeForFileName('REPORT.PDF')).toBe('application/pdf');
  });

  it('handles a name with dots in it', () => {
    expect(mimeTypeForFileName('report.2026.08.csv')).toBe('text/csv');
  });

  it('falls back rather than guessing', () => {
    expect(mimeTypeForFileName('report')).toBe(FALLBACK_MIME_TYPE);
    expect(mimeTypeForFileName('report.')).toBe(FALLBACK_MIME_TYPE);
    expect(mimeTypeForFileName('report.zzz')).toBe(FALLBACK_MIME_TYPE);
    // A dotfile has no extension, only a name.
    expect(mimeTypeForFileName('.gitignore')).toBe(FALLBACK_MIME_TYPE);
  });
});

describe('isPickerCancelled', () => {
  it('recognises the coded error Expo throws when the picker is dismissed', () => {
    expect(isPickerCancelled({ code: 'ERR_PICKER_CANCELLED' })).toBe(true);
  });

  it('recognises it by message if the code ever changes', () => {
    expect(isPickerCancelled(new Error('The file picker was cancelled by the user'))).toBe(true);
  });

  it('does NOT swallow a real write failure', () => {
    // This is the branch that must still fall through to the share sheet, so the
    // user gets their file even when writing to the chosen folder failed.
    expect(isPickerCancelled(new Error('Destination already exists'))).toBe(false);
    expect(isPickerCancelled({ code: 'ERR_UNABLE_TO_WRITE' })).toBe(false);
  });

  it('tolerates anything at all being thrown', () => {
    expect(isPickerCancelled(null)).toBe(false);
    expect(isPickerCancelled(undefined)).toBe(false);
    expect(isPickerCancelled('cancelled')).toBe(false);
    expect(isPickerCancelled(42)).toBe(false);
  });
});
