import { scrubSentryEvent } from './sentry-scrub';

describe('scrubSentryEvent', () => {
  it('drops body, cookies and auth/cookie headers (any case) on /oauth/ routes', () => {
    const ev: any = {
      request: {
        url: 'https://api.ai-budget.pl/oauth/token',
        method: 'POST',
        data: 'grant_type=refresh_token&refresh_token=aba_rt_x&client_secret=aba_cs_y',
        cookies: { sid: 'z' },
        headers: { Authorization: 'Basic abc', COOKIE: 'sid=z', 'content-type': 'application/x-www-form-urlencoded' },
      },
    };
    const out = scrubSentryEvent(ev);
    expect(out.request.data).toBeUndefined();
    expect(out.request.cookies).toBeUndefined();
    expect(out.request.headers).toEqual({ 'content-type': 'application/x-www-form-urlencoded' });
    expect(out.request.url).toBe('https://api.ai-budget.pl/oauth/token');
  });

  it('drops them on /public/ routes too, and on the consent route under /api/v1/oauth/', () => {
    for (const url of ['https://api.ai-budget.pl/public/v1/expenses', '/public/v1/account', '/api/v1/oauth/authorize/consent']) {
      const out = scrubSentryEvent({ request: { url, data: { a: 1 }, headers: { authorization: 'Bearer aba_at_x' } } } as any);
      expect(out.request.data).toBeUndefined();
      expect(out.request.headers).toEqual({});
    }
  });

  it('leaves the app routes body alone (the existing behaviour) but still drops a secret-bearing query', () => {
    const out: any = scrubSentryEvent({
      request: {
        url: 'https://api.ai-budget.pl/api/v1/expenses?code=abc&x=1',
        query_string: 'code=abc&x=1',
        data: { amount: 1 },
        headers: { 'user-agent': 'k' },
      },
    } as any);
    expect(out.request.data).toEqual({ amount: 1 });
    expect(out.request.url).toBe('https://api.ai-budget.pl/api/v1/expenses');
    expect(out.request.query_string).toBeUndefined();
    expect(out.request.headers).toEqual({ 'user-agent': 'k' });
  });

  it.each(['token', 'access_token', 'refresh_token', 'client_secret', 'code_verifier', 'Code'])(
    'strips a query string carrying %s (string or object form)',
    (name) => {
      const out: any = scrubSentryEvent({
        request: { url: `/x?${name}=s`, query_string: { [name]: 's' } },
      } as any);
      expect(out.request.url).toBe('/x');
      expect(out.request.query_string).toBeUndefined();
    },
  );

  it('keeps a harmless query', () => {
    const out: any = scrubSentryEvent({ request: { url: '/public/v1/expenses?limit=50', query_string: 'limit=50' } } as any);
    expect(out.request.url).toBe('/public/v1/expenses?limit=50');
    expect(out.request.query_string).toBe('limit=50');
  });

  it('scrubs a secret query from http breadcrumbs', () => {
    const out: any = scrubSentryEvent({
      breadcrumbs: [{ category: 'http', data: { url: 'https://x/cb?code=abc' } }, { message: 'm' }],
    } as any);
    expect(out.breadcrumbs[0].data.url).toBe('https://x/cb');
    expect(out.breadcrumbs[1]).toEqual({ message: 'm' });
  });

  it('passes an event without a request through', () => {
    const ev: any = { message: 'hi' };
    expect(scrubSentryEvent(ev)).toEqual({ message: 'hi' });
  });
});
