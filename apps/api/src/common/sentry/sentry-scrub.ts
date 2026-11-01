import type { Event } from '@sentry/node';

/**
 * Sentry `beforeSend` / `beforeSendTransaction` scrubber (public API M1).
 *
 * The OAuth server and `/public/v1` carry credentials in places Sentry captures by default: the
 * token request body (`refresh_token`, `client_secret`, `code_verifier`), the `Authorization`
 * header (Bearer access token, Basic client secret) and, on a redirect, `?code=` in the URL. For
 * those routes the body, cookies and auth/cookie headers are dropped; on every route a query
 * string carrying a credential-like parameter is removed. Imported by `instrument.ts`, so this
 * file must stay dependency-free (it loads before anything else).
 */
const SENSITIVE_PATH = /^(?:\/api\/v1)?\/(?:oauth|public)\//i;
const SENSITIVE_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie']);
const SENSITIVE_PARAM = /(?:^|[?&])(?:code|token|access_token|refresh_token|id_token|client_secret|code_verifier)=/i;

export function scrubSentryEvent<T extends Event>(event: T): T {
  const req = event.request;
  if (req) {
    if (SENSITIVE_PATH.test(pathOf(req.url))) {
      delete req.data;
      delete req.cookies;
      if (req.headers) {
        for (const name of Object.keys(req.headers)) {
          if (SENSITIVE_HEADERS.has(name.toLowerCase())) delete req.headers[name];
        }
      }
    }
    if (typeof req.url === 'string' && hasSensitiveQuery(req.url)) req.url = req.url.split('?')[0];
    if (req.query_string !== undefined && hasSensitiveQuery(queryText(req.query_string))) delete req.query_string;
  }
  for (const crumb of event.breadcrumbs ?? []) {
    const url = crumb.data?.url;
    if (typeof url === 'string' && hasSensitiveQuery(url)) crumb.data!.url = url.split('?')[0];
  }
  return event;
}

function pathOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url, 'http://local').pathname;
  } catch {
    return url.split('?')[0];
  }
}

function hasSensitiveQuery(text: string): boolean {
  const q = text.includes('?') ? text.slice(text.indexOf('?')) : `?${text}`;
  return SENSITIVE_PARAM.test(q);
}

function queryText(q: unknown): string {
  if (typeof q === 'string') return q;
  if (Array.isArray(q)) return q.map((pair) => (Array.isArray(pair) ? `${pair[0]}=` : '')).join('&');
  if (q && typeof q === 'object') return Object.keys(q).map((k) => `${k}=`).join('&');
  return '';
}
