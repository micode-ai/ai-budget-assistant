/**
 * Display rules for a developer app's name and description (public API M2). Both are shown to a
 * user on the consent screen, so they must not be able to impersonate us or break the layout.
 */

/** C0/C1 controls (incl. \n \r \t), format chars (bidi overrides, zero-width) and the Unicode line/paragraph separators. */
const FORBIDDEN_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/** Reserved names, compared after {@link normaliseAppName}: equal to or starting with any of them is refused. */
const RESERVED = ['AI Budget', 'AI Budżet', 'AIBudget', 'MiCode'].map(normaliseAppName);

export function hasForbiddenChars(value: string): boolean {
  return FORBIDDEN_CHARS.test(value);
}

/** Lower-case, diacritics removed (ż → z), everything but letters and digits dropped (spaces, dashes). */
export function normaliseAppName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function isReservedAppName(value: string): boolean {
  const n = normaliseAppName(value);
  return RESERVED.some((r) => n.startsWith(r));
}
