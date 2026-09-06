/**
 * Platform-free helpers shared by `fileImport.native.ts` and `fileImport.web.ts`.
 *
 * Nothing here may touch `expo-file-system` or the DOM — both platform
 * implementations import this module. Same rule, and same reason, as
 * `fileExport.utils.ts`.
 */

/** Reading a file the user picked. Mirrors `FileExportResult`: never throws. */
export type FileReadResult =
  | { status: 'ok'; text: string }
  | { status: 'error'; error: string };

/**
 * `not_json` — the file is not JSON at all.
 * `not_a_backup` — it parsed, but it is not one of our backups.
 *
 * Both reasons currently produce the same user-facing sentence, because the
 * action they call for is the same one ("check the format, pick another file").
 * They are still distinguished here so the caller *can* separate them later
 * without the parser having to learn anything new, and so each branch is
 * individually pinned by a test.
 */
export type BackupParseResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'not_json' | 'not_a_backup' };

/**
 * Is this text one of our backup files?
 *
 * The shape check is the server's: `POST /backups/restore` validates
 * `version` and `data` at the top level, so a file missing either would be
 * uploaded only to be rejected — better to say so before sending it.
 *
 * Returns the **original text**, not a re-serialised copy: the restore endpoint
 * takes the raw string, and round-tripping it through `JSON.stringify` would
 * quietly hand the server a different payload from the one on disk.
 *
 * Truthiness, not presence, is deliberate — it is what the screen checked
 * before this moved out of it, and a real backup's `version` is never `0`.
 */
export function parseBackupFile(text: string): BackupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not_json' };
  }

  // `typeof null === 'object'`, and `JSON.parse('null')` is a real input — the
  // screen only survived it because a `TypeError` fell into the same `catch`
  // as a parse failure. Guarding here keeps this function total.
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'not_a_backup' };

  const record = parsed as Record<string, unknown>;
  if (!record.version || !record.data) return { ok: false, reason: 'not_a_backup' };

  return { ok: true, text };
}
