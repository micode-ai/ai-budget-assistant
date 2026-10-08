import { createApiClient } from './apiClient';
import { loadConfig } from './config';

describe('createApiClient', () => {
  function client(fetchImpl: typeof fetch) {
    return createApiClient({ baseUrl: 'http://api:3000/api/v1', secret: 'sekret', timeoutMs: 50, fetchImpl });
  }

  it('POSTs JSON with the secret header and NEVER a forwarded-for header', async () => {
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ result: 'accept' }), { status: 200 }));
    const out = await client(fetchImpl as unknown as typeof fetch).rcpt('abcdefghijklmnop', '203.0.113.9');
    expect(out).toEqual({ status: 200, body: { result: 'accept' } });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api:3000/api/v1/internal/inbound-mail/rcpt');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ token: 'abcdefghijklmnop', remoteIp: '203.0.113.9' });
    const headers = Object.fromEntries(Object.entries(init.headers as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    expect(headers).toEqual({ 'content-type': 'application/json', 'x-inbound-secret': 'sekret' });
    expect(headers['x-forwarded-for']).toBeUndefined();
    expect(headers['x-real-ip']).toBeUndefined();
  });

  it('posts the handoff payload to /messages', async () => {
    const fetchImpl = jest.fn(async () => new Response('{}', { status: 202 }));
    const out = await client(fetchImpl as unknown as typeof fetch).handoff({ token: 't' } as never);
    expect(out.status).toBe(202);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('http://api:3000/api/v1/internal/inbound-mail/messages');
  });

  it('returns status 0 on a network error or a timeout (mapped to 451)', async () => {
    const boom = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    expect(await client(boom as unknown as typeof fetch).rcpt('x', 'y')).toEqual({ status: 0 });

    const slow = jest.fn(
      (_u: unknown, init?: RequestInit) =>
        new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted')))),
    );
    expect(await client(slow as unknown as typeof fetch).rcpt('x', 'y')).toEqual({ status: 0 });
  });

  it('tolerates a non-JSON body', async () => {
    const fetchImpl = jest.fn(async () => new Response('Bad Gateway', { status: 502 }));
    expect(await client(fetchImpl as unknown as typeof fetch).rcpt('x', 'y')).toEqual({ status: 502, body: undefined });
  });
});

describe('loadConfig', () => {
  it('refuses to start without the shared secret', () => {
    expect(() => loadConfig({})).toThrow(/INBOUND_MAIL_SHARED_SECRET/);
    expect(() => loadConfig({ INBOUND_MAIL_SHARED_SECRET: '  ' })).toThrow();
  });

  it('applies the documented defaults', () => {
    expect(loadConfig({ INBOUND_MAIL_SHARED_SECRET: 'x' })).toMatchObject({
      domain: 'in.ai-budget.pl',
      hostname: 'mail-in.ai-budget.pl',
      apiUrl: 'http://api:3000/api/v1',
      port: 2525,
    });
  });
});
