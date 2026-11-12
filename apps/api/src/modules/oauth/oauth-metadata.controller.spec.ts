import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { ConfigService } from '@nestjs/config';
import { OAuthMetadataController } from './oauth-metadata.controller';
import { McpEnabledGuard } from './guards/mcp-enabled.guard';

const cfg = (env: Record<string, string | undefined>): ConfigService =>
  ({ get: (k: string) => env[k] }) as unknown as ConfigService;
const ON = { PUBLIC_API_ENABLED: 'true', MCP_ENABLED: 'true' };
const FIVE = ['expenses:read', 'categories:read', 'incomes:read', 'budgets:read', 'analytics:read'];

describe('OAuthMetadataController', () => {
  it('is guarded by McpEnabledGuard at class level (every route 404s with either flag off)', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, OAuthMetadataController)).toEqual([McpEnabledGuard]);
  });

  it('authorization server metadata (RFC 8414) with the defaults', () => {
    const c = new OAuthMetadataController(cfg(ON));
    expect(c.authorizationServer()).toEqual({
      issuer: 'https://api.ai-budget.pl',
      authorization_endpoint: 'https://app.ai-budget.pl/authorize',
      token_endpoint: 'https://api.ai-budget.pl/oauth/token',
      revocation_endpoint: 'https://api.ai-budget.pl/oauth/revoke',
      registration_endpoint: 'https://api.ai-budget.pl/oauth/register',
      scopes_supported: FIVE,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
      revocation_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    });
  });

  it('follows OAUTH_ISSUER / OAUTH_AUTHORIZE_URL', () => {
    const c = new OAuthMetadataController(
      cfg({ ...ON, OAUTH_ISSUER: 'https://staging.example.com/', OAUTH_AUTHORIZE_URL: 'https://app.staging.example.com/authorize' }),
    );
    const m = c.authorizationServer();
    expect(m.issuer).toBe('https://staging.example.com');
    expect(m.authorization_endpoint).toBe('https://app.staging.example.com/authorize');
    expect(m.token_endpoint).toBe('https://staging.example.com/oauth/token');
    expect(m.revocation_endpoint).toBe('https://staging.example.com/oauth/revoke');
    expect(m.registration_endpoint).toBe('https://staging.example.com/oauth/register');
  });

  it('protected resource metadata (RFC 9728), at both paths, names the MCP resource and our issuer', () => {
    const c = new OAuthMetadataController(cfg({ ...ON, MCP_RESOURCE_URL: 'https://api.ai-budget.pl/mcp/' }));
    const expected = {
      resource: 'https://api.ai-budget.pl/mcp',
      authorization_servers: ['https://api.ai-budget.pl'],
      scopes_supported: FIVE,
      bearer_methods_supported: ['header'],
    };
    expect(c.protectedResource()).toEqual(expected);
    expect(c.protectedResourceMcp()).toEqual(expected);
  });
});
