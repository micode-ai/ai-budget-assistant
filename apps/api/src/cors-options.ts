import type { CorsOptions, CorsOptionsDelegate } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Third-party-facing routes (the OAuth token/revoke endpoints and the public REST API) are called
 * from any origin with a bearer token or client credentials — never with cookies — so they answer
 * `Access-Control-Allow-Origin: *` WITHOUT credentials, preflight included. Every other route keeps
 * the explicit origin list from `CORS_ORIGIN` exactly as before.
 *
 * Exact names for the OAuth pair (not `/oauth/*`): the consent page backend lives at
 * `/api/v1/oauth/authorize/*` and must stay on the app's credentialed origin list.
 */
const PUBLIC_EXACT = new Set(['/oauth/token', '/oauth/revoke']);
const PUBLIC_PREFIX = '/public/';

export function isPublicCorsPath(url: string | undefined): boolean {
  const path = (url ?? '').split('?')[0].replace(/\/+$/, '');
  return PUBLIC_EXACT.has(path) || `${path}/`.startsWith(PUBLIC_PREFIX);
}

export const PUBLIC_CORS_OPTIONS: CorsOptions = {
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  // Without this a browser caller cannot read the limit headers the public guard sets.
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
  maxAge: 600,
};

/** Per-request CORS options: public routes get `*` without credentials, everything else `appOptions`. */
export function buildCorsDelegate(appOptions: CorsOptions): CorsOptionsDelegate<{ originalUrl?: string; url?: string }> {
  return (req, cb) => cb(null as unknown as Error, isPublicCorsPath(req.originalUrl ?? req.url) ? PUBLIC_CORS_OPTIONS : appOptions);
}
