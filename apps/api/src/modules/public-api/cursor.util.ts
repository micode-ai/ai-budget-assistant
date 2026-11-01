import { PublicApiError } from './public-api-error';

/**
 * Opaque keyset cursors for `/public/v1`: base64url of a JSON array of strings, e.g. the last row's
 * `(date, id)` for the expense list or `(updated_at, id)` for the changes feed.
 *
 * Opaque to integrators by contract — they must not build or parse one — but NOT a secret and not
 * signed: every value in it is re-validated by the query that consumes it (format, then account
 * scoping by the normal `where`), so a forged cursor can only move the window inside the caller's
 * own account.
 */
export function encodeCursor(parts: string[]): string {
  return Buffer.from(JSON.stringify(parts), 'utf8').toString('base64url');
}

/** Decodes a cursor of exactly `arity` string parts; anything else is `400 invalid_cursor`. */
export function decodeCursor(c: string, arity: number): string[] {
  if (typeof c !== 'string' || !/^[A-Za-z0-9_-]+$/.test(c) || c.length > 1024) throw invalidCursor();
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(c, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  if (!Array.isArray(parsed) || parsed.length !== arity || !parsed.every((p) => typeof p === 'string')) {
    throw invalidCursor();
  }
  return parsed as string[];
}

export function invalidCursor(): PublicApiError {
  return new PublicApiError(400, 'invalid_cursor', 'The cursor is invalid. Use next_cursor from a previous response unchanged.');
}
