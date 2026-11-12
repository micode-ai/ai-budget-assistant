import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { McpEnabledGuard } from './guards/mcp-enabled.guard';
import { MCP_DEFAULT_SCOPES, mcpResourceUrl, oauthAuthorizeUrl, oauthIssuer } from './mcp.config';

/**
 * What `/oauth/token` and `/oauth/revoke` accept today (OAuthTokenService.authenticateClient: HTTP
 * Basic, or client_id/client_secret in the body), plus `none` for public clients (PKCE alone).
 */
const CLIENT_AUTH_METHODS = ['none', 'client_secret_basic', 'client_secret_post'];

/**
 * OAuth discovery documents for MCP clients, served WITHOUT the api/v1 prefix (each path is named in
 * global-prefix-exclusions.ts) and with CORS `*` (cors-options.ts):
 *
 * - `/.well-known/oauth-authorization-server` — RFC 8414 authorization server metadata. The
 *   authorization endpoint is the consent page on the app origin; everything else is on the issuer.
 * - `/.well-known/oauth-protected-resource` and its `/mcp`-suffixed form (RFC 9728 §3.1 inserts the
 *   resource path after the well-known segment) — protected resource metadata for `/mcp`.
 *
 * 404 unless PUBLIC_API_ENABLED and MCP_ENABLED are both on. Not part of the published REST API document.
 */
@ApiExcludeController()
@Controller('.well-known')
@UseGuards(McpEnabledGuard)
export class OAuthMetadataController {
  constructor(private readonly config: ConfigService) {}

  @Get('oauth-authorization-server')
  authorizationServer() {
    const issuer = oauthIssuer(this.config);
    return {
      issuer,
      authorization_endpoint: oauthAuthorizeUrl(this.config),
      token_endpoint: `${issuer}/oauth/token`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      registration_endpoint: `${issuer}/oauth/register`,
      scopes_supported: [...MCP_DEFAULT_SCOPES],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: [...CLIENT_AUTH_METHODS],
      revocation_endpoint_auth_methods_supported: [...CLIENT_AUTH_METHODS],
    };
  }

  @Get('oauth-protected-resource')
  protectedResource() {
    return this.resourceMetadata();
  }

  @Get('oauth-protected-resource/mcp')
  protectedResourceMcp() {
    return this.resourceMetadata();
  }

  private resourceMetadata() {
    return {
      resource: mcpResourceUrl(this.config),
      authorization_servers: [oauthIssuer(this.config)],
      scopes_supported: [...MCP_DEFAULT_SCOPES],
      bearer_methods_supported: ['header'],
    };
  }
}
