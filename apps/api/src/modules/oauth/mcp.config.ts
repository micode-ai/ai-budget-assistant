import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { isPublicApiEnabled } from './oauth.config';
import type { PublicScope } from './oauth-scopes';

export const DEFAULT_MCP_RESOURCE_URL = 'https://api.ai-budget.pl/mcp';
export const DEFAULT_OAUTH_ISSUER = 'https://api.ai-budget.pl';
export const DEFAULT_OAUTH_AUTHORIZE_URL = 'https://app.ai-budget.pl/authorize';

/** What a dynamically registered assistant gets when its authorize request names no scope. */
export const MCP_DEFAULT_SCOPES = [
  'expenses:read',
  'categories:read',
  'incomes:read',
  'budgets:read',
  'analytics:read',
] as const satisfies readonly PublicScope[];

/** The only scopes a `mcp_dcr` client may ever hold: read-only, and no receipt images. */
export const DCR_ALLOWED_SCOPES: readonly PublicScope[] = MCP_DEFAULT_SCOPES;

function flag(config: ConfigService, name: string): boolean {
  return `${config.get<string>(name) ?? ''}`.trim().toLowerCase() === 'true';
}

/**
 * The MCP connector is on only when BOTH `PUBLIC_API_ENABLED` and `MCP_ENABLED` are `true` (trimmed,
 * any case) — the same parsing as `isPublicApiEnabled`. With it off the public API is unchanged.
 */
export function isMcpEnabled(config: ConfigService): boolean {
  return isPublicApiEnabled(config) && flag(config, 'MCP_ENABLED');
}

/**
 * Lower-cases scheme and host and drops trailing slashes from the path, so `HTTPS://API.x/mcp/`
 * and `https://api.x/mcp` are one identifier. Returns null for anything that is not an absolute
 * http(s) URL, or that carries a fragment (RFC 8707 §2) or credentials.
 */
export function normalizeResourceUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.hash || s.includes('#') || url.username || url.password) return null;
  // URL already lower-cases scheme and host; the path keeps its case.
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${path}${url.search}`;
}

const logger = new Logger('McpConfig');
/** `name=value` pairs already reported, so a bad value is logged once, not on every request. */
const warnedInvalid = new Set<string>();

function urlFromEnv(config: ConfigService, name: string, fallback: string): string {
  const raw = `${config.get<string>(name) ?? ''}`.trim();
  if (!raw) return fallback;
  const normalized = normalizeResourceUrl(raw);
  if (normalized) return normalized;
  // Never a silent fallback: a typo here would otherwise quietly point clients at production.
  const key = `${name}=${raw}`;
  if (!warnedInvalid.has(key)) {
    warnedInvalid.add(key);
    logger.warn(`${name} is not an absolute http(s) URL without fragment or credentials; using the default ${fallback}`);
  }
  return fallback;
}

/**
 * The RFC 8707 resource identifier of `/mcp` (`MCP_RESOURCE_URL`), normalized. Tokens bound to it
 * store exactly this string, and the authorizer compares exactly against it.
 */
export function mcpResourceUrl(config: ConfigService): string {
  return urlFromEnv(config, 'MCP_RESOURCE_URL', DEFAULT_MCP_RESOURCE_URL);
}

/** The OAuth issuer (`OAUTH_ISSUER`), no trailing slash. */
export function oauthIssuer(config: ConfigService): string {
  return urlFromEnv(config, 'OAUTH_ISSUER', DEFAULT_OAUTH_ISSUER);
}

/** The consent page the authorization-server metadata advertises (`OAUTH_AUTHORIZE_URL`). */
export function oauthAuthorizeUrl(config: ConfigService): string {
  return urlFromEnv(config, 'OAUTH_AUTHORIZE_URL', DEFAULT_OAUTH_AUTHORIZE_URL);
}
