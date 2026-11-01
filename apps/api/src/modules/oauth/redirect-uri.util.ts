/**
 * Registration-time redirect URI rule: `https://` only, plus `http://localhost[:port]` and
 * `http://127.0.0.1[:port]` for local development. No fragment, no userinfo.
 */
export function isAllowedRedirectUri(uri: string): boolean {
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
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  }
  return false;
}
