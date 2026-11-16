import type { Event } from '@sentry/node';

/**
 * Sentry `beforeSend` / `beforeSendTransaction` scrubber.
 *
 * Request bodies, cookies and auth/cookie headers are dropped on EVERY route (ABA-809). They
 * used to be dropped only for `/oauth` and `/public`, so an error elsewhere could ship a login
 * password, an expense, a receipt's text or a chat prompt to a third party; the stack trace and
 * the URL are what a report needs. On every route a query string carrying a credential-like
 * parameter is removed too. Imported by `instrument.ts`, so this file must stay
 * dependency-free (it loads before anything else).
 */
const SENSITIVE_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie']);
const SENSITIVE_PARAM = /(?:^|[?&])(?:code|token|access_token|refresh_token|id_token|client_secret|code_verifier)=/i;

export function scrubSentryEvent<T extends Event>(event: T): T {
  const req = event.request;
  if (req) {
    delete req.data;
    delete req.cookies;
    if (req.headers) {
      for (const name of Object.keys(req.headers)) {
        if (SENSITIVE_HEADERS.has(name.toLowerCase())) delete req.headers[name];
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
