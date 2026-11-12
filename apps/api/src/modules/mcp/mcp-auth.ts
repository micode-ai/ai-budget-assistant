import type { ConfigService } from '@nestjs/config';
import { mcpResourceUrl, oauthIssuer } from '../oauth/mcp.config';
import { readBearer } from '../public-api/guards/public-api-auth.guard';
import type { PublicApiAuthorizer } from '../public-api/public-api-authorizer.service';
import { PublicApiError, type PublicApiErrorBody } from '../public-api/public-api-error';

/**
 * Where an MCP client finds out how to get a token for `/mcp`: the RFC 9728 protected resource
 * metadata, at the `/mcp`-suffixed well-known path on the issuer (OAuthMetadataController).
 */
export function mcpResourceMetadataUrl(config: ConfigService): string {
  return `${oauthIssuer(config)}/.well-known/oauth-protected-resource/mcp`;
}

/**
 * The `WWW-Authenticate` value of a 401 from `/mcp`. Without a token it only points at the
 * metadata (RFC 6750 §3.1: no error code when the request carried no credentials); with a token
 * that failed it adds `error="invalid_token"`.
 */
export function mcpChallenge(config: ConfigService, tokenSent: boolean): string {
  const base = `Bearer resource_metadata="${mcpResourceMetadataUrl(config)}"`;
  return tokenSent ? `${base}, error="invalid_token"` : base;
}

export type McpAuthResult =
  | { ok: true; bearer: string }
  | { ok: false; status: 401; wwwAuthenticate: string; body: PublicApiErrorBody };

/**
 * The connection-level check of one `/mcp` request, through the ONE authorizer the public API uses
 * (token-only, connection-level, bound to the MCP resource): a missing, unknown, expired, revoked
 * or wrong-surface token is a 401 with the challenge, before any MCP work.
 *
 * This check does not count against the rate limit (`consumeRateLimit: false`): `initialize` /
 * `tools/list` carry no data, and each tool call authorizes again WITH the count and turns a
 * refusal into a tool error with a retry hint. Only `invalid_token` stops the request here.
 *
 * Never logs the token.
 */
export async function authenticateMcp(
  authorizer: Pick<PublicApiAuthorizer, 'authorize'>,
  config: ConfigService,
  authorization: string | string[] | undefined,
): Promise<McpAuthResult> {
  const bearer = readBearer(authorization);
  const sent = authorization !== undefined && authorization !== '';
  if (!bearer) return refuse(config, sent);
  try {
    await authorizer.authorize(bearer, {
      requiredScopes: [],
      tokenOnly: true,
      connectionLevel: true,
      accountId: null,
      resource: mcpResourceUrl(config),
      // Not counted: each tool call authorizes again WITH the count (one unit per tool call).
      consumeRateLimit: false,
    });
  } catch (err) {
    if (err instanceof PublicApiError && err.code === 'invalid_token') return refuse(config, true);
    if (!(err instanceof PublicApiError)) throw err;
  }
  return { ok: true, bearer };
}

function refuse(config: ConfigService, tokenSent: boolean): McpAuthResult {
  return {
    ok: false,
    status: 401,
    wwwAuthenticate: mcpChallenge(config, tokenSent),
    body: { error: { code: 'invalid_token', message: 'The access token is missing, invalid, expired or revoked.' } },
  };
}
