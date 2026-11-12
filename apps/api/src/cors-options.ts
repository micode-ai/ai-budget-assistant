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

/**
 * The MCP connector's paths (spec decision 6), exact names only: the MCP endpoint, dynamic client
 * registration and the three OAuth discovery documents. Same `*`-without-credentials policy, plus
 * the MCP transport headers.
 */
const MCP_EXACT = new Set([
  '/mcp',
  '/oauth/register',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
]);

function pathOf(url: string | undefined): string {
  return (url ?? '').split('?')[0].replace(/\/+$/, '');
}

export function isPublicCorsPath(url: string | undefined): boolean {
  const path = pathOf(url);
  return PUBLIC_EXACT.has(path) || `${path}/`.startsWith(PUBLIC_PREFIX);
}

export function isMcpCorsPath(url: string | undefined): boolean {
  return MCP_EXACT.has(pathOf(url));
}

export const PUBLIC_CORS_OPTIONS: CorsOptions = {
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  // Without this a browser caller cannot read the limit headers the public guard sets.
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
  maxAge: 600,
};

/**
 * The MCP paths: `*` without credentials like the public API, but with an explicit header list —
 * an MCP client sends `mcp-protocol-version` / `mcp-session-id`, and must be able to read
 * `WWW-Authenticate` (the 401 that points it at the resource metadata) and `mcp-session-id`.
 */
export const MCP_CORS_OPTIONS: CorsOptions = {
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'mcp-protocol-version', 'mcp-session-id'],
  exposedHeaders: ['WWW-Authenticate', 'mcp-session-id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
  maxAge: 600,
};

/** Per-request CORS options: MCP and public routes get `*` without credentials, everything else `appOptions`. */
export function buildCorsDelegate(appOptions: CorsOptions): CorsOptionsDelegate<{ originalUrl?: string; url?: string }> {
  return (req, cb) => {
    const url = req.originalUrl ?? req.url;
    const options = isMcpCorsPath(url) ? MCP_CORS_OPTIONS : isPublicCorsPath(url) ? PUBLIC_CORS_OPTIONS : appOptions;
    cb(null as unknown as Error, options);
  };
}
