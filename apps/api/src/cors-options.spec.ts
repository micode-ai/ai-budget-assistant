import { buildCorsDelegate, isMcpCorsPath, isPublicCorsPath, MCP_CORS_OPTIONS, PUBLIC_CORS_OPTIONS } from './cors-options';

const MCP_PATHS = [
  '/mcp',
  '/oauth/register',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
];

describe('cors options', () => {
  it('treats the OAuth token/revoke endpoints and /public/* as public', () => {
    for (const p of ['/oauth/token', '/oauth/revoke', '/oauth/token?x=1', '/public/v1/expenses', '/public/docs/en']) {
      expect(isPublicCorsPath(p)).toBe(true);
    }
  });

  it('keeps the consent backend and ordinary routes on the app origin list', () => {
    for (const p of [
      '/api/v1/oauth/authorize/approve',
      '/oauth/authorize/preview',
      '/api/v1/expenses',
      '/publicity',
      '/api/v1/public/v1/expenses',
      undefined,
    ]) {
      expect(isPublicCorsPath(p)).toBe(false);
    }
  });

  it('gives public routes `*` without credentials and everything else the app options', () => {
    const app = { origin: ['https://admin.ai-budget.pl'], credentials: true };
    const delegate = buildCorsDelegate(app);
    const pick = (originalUrl: string) => {
      let out: unknown;
      delegate({ originalUrl }, (_e, o) => (out = o));
      return out;
    };
    expect(pick('/oauth/token')).toBe(PUBLIC_CORS_OPTIONS);
    expect(PUBLIC_CORS_OPTIONS).toMatchObject({ origin: '*', credentials: false });
    expect(pick('/api/v1/users/me')).toBe(app);
  });

  it('exposes the rate-limit headers to browser callers of the public API', () => {
    expect(PUBLIC_CORS_OPTIONS.exposedHeaders).toEqual(['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After']);
  });

  it('the five MCP paths get `*` without credentials, with the MCP headers allowed and exposed', () => {
    const app = { origin: ['https://admin.ai-budget.pl'], credentials: true };
    const delegate = buildCorsDelegate(app);
    for (const p of [...MCP_PATHS, '/mcp?x=1', '/mcp/', '/oauth/register/']) {
      expect(isMcpCorsPath(p)).toBe(true);
      let out: any;
      delegate({ originalUrl: p }, (_e, o) => (out = o));
      expect(out).toBe(MCP_CORS_OPTIONS);
    }
    expect(MCP_CORS_OPTIONS).toMatchObject({ origin: '*', credentials: false });
    expect(MCP_CORS_OPTIONS.allowedHeaders).toEqual(['Authorization', 'Content-Type', 'mcp-protocol-version', 'mcp-session-id']);
    expect(MCP_CORS_OPTIONS.exposedHeaders).toEqual(expect.arrayContaining(['WWW-Authenticate', 'mcp-session-id']));
  });

  it('does not treat look-alikes, the prefixed forms or other oauth/.well-known paths as MCP', () => {
    for (const p of [
      '/mcpx',
      '/mcp/tools',
      '/api/v1/mcp',
      '/oauth/registerx',
      '/api/v1/oauth/register',
      '/.well-known/assetlinks.json',
      '/.well-known/oauth-protected-resource/other',
      '/oauth/token',
      undefined,
    ]) {
      expect(isMcpCorsPath(p)).toBe(false);
    }
  });

  it('leaves every other path exactly as before (public stays PUBLIC_CORS_OPTIONS, app stays app)', () => {
    const app = { origin: ['https://admin.ai-budget.pl'], credentials: true };
    const delegate = buildCorsDelegate(app);
    const pick = (originalUrl: string) => {
      let out: unknown;
      delegate({ originalUrl }, (_e, o) => (out = o));
      return out;
    };
    for (const p of ['/oauth/token', '/oauth/revoke', '/public/v1/expenses']) expect(pick(p)).toBe(PUBLIC_CORS_OPTIONS);
    for (const p of ['/api/v1/oauth/authorize/approve', '/api/v1/users/me', '/.well-known/assetlinks.json']) expect(pick(p)).toBe(app);
    expect(PUBLIC_CORS_OPTIONS.allowedHeaders).toBeUndefined();
    expect(PUBLIC_CORS_OPTIONS.exposedHeaders).toEqual(['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After']);
  });
});
