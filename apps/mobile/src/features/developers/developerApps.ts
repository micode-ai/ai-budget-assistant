/**
 * Pure rules for Settings → Developers and Settings → Connected apps (Public API phase 1).
 * Kept free of React Native so every decision here can be pinned by jest.
 */

export type DocsLanguage = 'en' | 'pl' | 'ru';

/** The public API docs exist in English, Polish and Russian only. */
export function docsLanguage(uiLanguage: string | null | undefined): DocsLanguage {
  const base = (uiLanguage ?? '').toLowerCase().split(/[-_]/)[0];
  if (base === 'pl') return 'pl';
  // Ukrainian and Belarusian readers are better served by the Russian guide than the English one.
  if (base === 'ru' || base === 'ua' || base === 'uk' || base === 'be') return 'ru';
  return 'en';
}

const PRODUCTION_API_ORIGIN = 'https://api.ai-budget.pl';

/**
 * `https://api.ai-budget.pl/public/docs/<en|pl|ru>`. The docs are outside the `/api/v1` prefix, so
 * the origin is taken from the API base URL (which keeps a dev build pointing at its own server).
 */
export function publicApiDocsUrl(uiLanguage: string | null | undefined, apiBaseUrl: string): string {
  let origin = PRODUCTION_API_ORIGIN;
  const m = /^(https?:\/\/[^/?#\s]+)/i.exec(apiBaseUrl.trim());
  if (m) origin = m[1];
  return `${origin}/public/docs/${docsLanguage(uiLanguage)}`;
}

/** With `PUBLIC_API_ENABLED` off every developer/connected-apps route answers 404. */
export function isPublicApiUnavailable(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 404;
}

/** i18n key explaining a failed developer-app call. */
export function developerAppErrorKey(error: unknown): string {
  const e = error as { status?: number; message?: string } | null;
  const message = typeof e?.message === 'string' ? e.message : '';
  if (message.includes('app_limit_reached')) return 'developerApps.errors.limit';
  if (message.includes('public_client_has_no_secret')) return 'developerApps.errors.publicClient';
  if (message.includes('app_name_reserved')) return 'developerApps.errors.nameReserved';
  if (e?.status === 404) return 'developerApps.errors.notFound';
  if (e?.status === 400) return 'developerApps.errors.invalid';
  return 'developerApps.errors.generic';
}

/** One redirect URI per line; blanks and exact duplicates dropped, order kept. */
export function parseRedirectUris(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const uri = line.trim();
    if (uri && !out.includes(uri)) out.push(uri);
  }
  return out;
}

/**
 * Redirect URIs a registration accepts: `https://`, or `http://localhost` / `http://127.0.0.1` with an
 * optional port. URL-parsed, the same way as the server (apps/api/src/modules/oauth/redirect-uri.util.ts),
 * so the form never refuses what the server would accept (`http://localhost?x=1`) or the reverse.
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
  // Lower-cased here because React Native's URL polyfill does not normalise case the way Node does.
  const protocol = url.protocol.toLowerCase();
  const host = url.hostname.toLowerCase();
  if (protocol === 'https:') return host.length > 0;
  if (protocol === 'http:') return host === 'localhost' || host === '127.0.0.1';
  return false;
}

/**
 * Line breaks, tabs and control/format characters (C0/C1, zero-width, bidi, line/paragraph separators) folded into single
 * spaces: the server refuses them in a name or description. Explicit ranges rather than `\p{…}`, which
 * older Hermes builds do not support.
 */
export function singleLine(text: string): string {
  return text
    .replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/**
 * Copies through `write` (expo-clipboard's `setStringAsync`) and never throws: a refused clipboard
 * (web without permission, insecure origin) is `'failed'`, so the UI can say so and leave the value
 * selectable. `setStringAsync` resolves `false` on some platforms instead of rejecting.
 */
export async function copyValue(
  write: (value: string) => Promise<boolean | void> | boolean | void,
  value: string,
): Promise<'copied' | 'failed'> {
  try {
    return (await write(value)) === false ? 'failed' : 'copied';
  } catch {
    return 'failed';
  }
}

/** `https://…` with a host — the server's rule for homepage, logo and privacy-policy URLs. */
export function isHttpsUrl(url: string): boolean {
  return /^https:\/\/[^/?#\s.]+\.[^/?#\s]+/i.test(url.trim());
}

/** The server refuses an 11th app (`app_limit_reached`). */
export const MAX_APPS_PER_DEVELOPER = 10;
export const MAX_REDIRECT_URIS = 10;
export const MAX_APP_NAME = 60;
export const MAX_APP_DESCRIPTION = 500;
