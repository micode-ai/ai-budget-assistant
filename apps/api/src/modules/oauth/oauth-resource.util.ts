import type { ConfigService } from '@nestjs/config';
import type { OAuthClient } from '@prisma/client';
import { isMcpEnabled, mcpResourceUrl, normalizeResourceUrl, oauthIssuer } from './mcp.config';

/** RFC 8707 `invalid_target`: the requested resource is unknown, malformed or not allowed here. */
export class InvalidTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTargetError';
  }
}

/**
 * Ruling R10: the public API's own identifiers — the issuer and `${issuer}/public/v1`, normalized
 * the same way as the MCP resource. A client that names either (a spec-following RFC 8707 client
 * of the public API) gets exactly what it got by sending nothing: the null (public) binding.
 */
export function publicApiResourceIds(config: ConfigService): string[] {
  const issuer = oauthIssuer(config);
  return [issuer, normalizeResourceUrl(`${issuer}/public/v1`) ?? `${issuer}/public/v1`];
}

/** True when `raw` names the public API itself (see `publicApiResourceIds`). */
export function isPublicApiResource(raw: string, config: ConfigService): boolean {
  const n = normalizeResourceUrl(raw);
  return n !== null && publicApiResourceIds(config).includes(n);
}

/**
 * The `resource` param of an authorize request. Absent or empty, or one of the public API's own
 * identifiers (R10) → null (the token is for `/public/v1`, as for every integration before MCP).
 * The MCP resource (after normalization:
 * trimmed, scheme+host lower-case, no trailing slash) → exactly `mcpResourceUrl(config)`, the
 * string the authorizer compares against — and only while the MCP flag is on. Anything else →
 * `InvalidTargetError`.
 */
export function parseResourceParam(raw: string | undefined, config: ConfigService): string | null {
  if (raw === undefined || raw.trim() === '') return null;
  if (isPublicApiResource(raw, config)) return null;
  const mcp = mcpResourceUrl(config);
  if (normalizeResourceUrl(raw) !== mcp)
    throw new InvalidTargetError('resource is not a known resource of this server');
  if (!isMcpEnabled(config)) throw new InvalidTargetError('resource is not available');
  return mcp;
}

/**
 * Token-endpoint check (code exchange and refresh): a `resource` param, when sent, must name the
 * same resource the code or rotated token is already bound to (`bound`, null = public API). The
 * public API's own identifiers (R10) name the null binding. It never changes the binding; the token
 * keeps the one chosen at authorize.
 */
export function assertResourceMatches(raw: string | undefined, bound: string | null, config: ConfigService): void {
  if (raw === undefined || raw.trim() === '') return;
  if (isPublicApiResource(raw, config)) {
    if (bound === null) return;
    throw new InvalidTargetError('resource does not match the authorization');
  }
  const requested = normalizeResourceUrl(raw);
  if (requested === null || bound === null || requested !== normalizeResourceUrl(bound)) {
    throw new InvalidTargetError('resource does not match the authorization');
  }
}

/**
 * Ruling R4: a dynamically registered assistant (`mcp_dcr`) exists only to reach `/mcp`, so its
 * authorization (preview, approve) and every token it obtains must be bound to the MCP resource.
 * `resource` is the already-parsed binding (null = the public API). Manual clients are unaffected.
 */
export function assertClientResource(client: Pick<OAuthClient, 'source'>, resource: string | null): void {
  if (client.source === 'mcp_dcr' && resource === null) {
    throw new InvalidTargetError('resource is required for this client');
  }
}
