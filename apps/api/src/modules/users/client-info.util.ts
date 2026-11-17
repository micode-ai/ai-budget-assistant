/**
 * The app build a request came from (ABA-813), read from the `X-App-Version`
 * and `X-App-Platform` headers the mobile/web client sends with every request.
 * Headers are client input: anything that is not a plausible version string or
 * a known platform is dropped, never stored.
 */
export interface ClientInfo {
  appVersion: string;
  appPlatform: 'android' | 'ios' | 'web';
}

const PLATFORMS = new Set(['android', 'ios', 'web']);
/** "1.42.0", "1.42.0 (123)", "1.42.0+abc1234". */
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}( \(\d{1,10}\)|\+[0-9a-f]{7,40})?$/;

type HeaderValue = string | string[] | undefined;

export function parseClientInfo(headers: Record<string, HeaderValue> | undefined): ClientInfo | null {
  if (!headers) return null;
  const one = (v: HeaderValue) => (Array.isArray(v) ? v[0] : v)?.trim();
  const version = one(headers['x-app-version']);
  const platform = one(headers['x-app-platform'])?.toLowerCase();
  if (!version || !platform || !VERSION_RE.test(version) || !PLATFORMS.has(platform)) return null;
  return { appVersion: version, appPlatform: platform as ClientInfo['appPlatform'] };
}
