/** Most redirect URIs a dynamically registered client may hold (spec decision 7). */
export const MAX_REDIRECT_URIS = 5;

/** Loopback hosts allowed over plain http, any port (`URL.hostname` keeps the IPv6 brackets). */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Whitespace, control or format characters. `new URL` silently drops tab/CR/LF and trims spaces,
 * so a URI that only parses after cleanup would be stored (and exact-matched at authorize) in a
 * form nobody validated.
 */
export function hasUnsafeUriChars(uri: string): boolean {
  return /[\s\p{Cc}\p{Cf}]/u.test(uri);
}

/**
 * The structural redirect URI rule: `https://` only, plus loopback `http://localhost`,
 * `http://127.0.0.1` and `http://[::1]` on any port (desktop clients and local development).
 * No custom schemes, no fragment, no userinfo. It does NOT apply the character rule, so it is what
 * an update re-checks for URIs the app already has (R13).
 */
export function isAllowedRedirectUriShape(uri: string): boolean {
  if (typeof uri !== 'string' || uri.length === 0 || uri.length > 2048) return false;
  if (uri.includes('#')) return false;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:') {
    return LOOPBACK_HOSTS.has(url.hostname);
  }
  return false;
}

/**
 * The rule for a NEW redirect URI (DCR registration, developer-app create, a URI added on update):
 * the structural rule plus no whitespace or control characters.
 */
export function isAllowedRedirectUri(uri: string): boolean {
  return typeof uri === 'string' && !hasUnsafeUriChars(uri) && isAllowedRedirectUriShape(uri);
}

/**
 * R13: on an update, a URI already stored on the app (exact string) is kept whatever the newer
 * character rule says — it was valid when it was saved and the app may depend on it. Only URIs
 * the update ADDS must pass `isAllowedRedirectUri`. Returns the first offending new URI, or null.
 */
export function firstRejectedNewRedirectUri(next: readonly string[], stored: readonly string[]): string | null {
  const known = new Set(stored);
  for (const uri of next) {
    if (!known.has(uri) && !isAllowedRedirectUri(uri)) return uri;
  }
  return null;
}
