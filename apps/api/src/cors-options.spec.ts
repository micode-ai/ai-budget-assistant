import { buildCorsDelegate, isPublicCorsPath, PUBLIC_CORS_OPTIONS } from './cors-options';

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
});
