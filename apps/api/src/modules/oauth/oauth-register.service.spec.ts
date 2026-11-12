import { HttpException } from '@nestjs/common';
import {
  OAuthRegisterService,
  DCR_GLOBAL_KEY,
  DCR_REGISTRATIONS_GLOBAL_PER_HOUR,
  DCR_REGISTRATIONS_PER_HOUR,
} from './oauth-register.service';

const FIVE = ['expenses:read', 'categories:read', 'incomes:read', 'budgets:read', 'analytics:read'];

function build() {
  const created: any[] = [];
  const windows = new Map<string, number>();
  const prisma: any = {
    oAuthClient: {
      create: jest.fn(async ({ data }) => {
        const row = { id: `db${created.length + 1}`, createdAt: new Date('2026-11-12T10:00:00Z'), ...data };
        created.push(row);
        return row;
      }),
    },
  };
  const cache: any = {
    incrementWindow: jest.fn(async (key: string) => {
      const n = (windows.get(key) ?? 0) + 1;
      windows.set(key, n);
      return n;
    }),
  };
  return { svc: new OAuthRegisterService(prisma, cache), prisma, cache, created, windows };
}

const valid = {
  client_name: 'Claude',
  redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
};

async function err(p: Promise<unknown>): Promise<{ status: number; body: any }> {
  const e = await p.then(
    () => null,
    (x) => x,
  );
  expect(e).toBeInstanceOf(HttpException);
  return { status: e.getStatus(), body: e.getResponse() };
}

describe('OAuthRegisterService', () => {
  it('creates a public, owner-less, unverified mcp_dcr client and answers per RFC 7591', async () => {
    const { svc, created, cache } = build();
    const r = await svc.register(
      { ...valid, client_uri: 'https://claude.ai', logo_uri: 'https://claude.ai/logo.png', token_endpoint_auth_method: 'none' },
      '203.0.113.7',
    );
    expect(cache.incrementWindow).toHaveBeenCalledWith('oauth:dcr:203.0.113.7', 3_600_000);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      secretHash: null,
      isConfidential: false,
      ownerUserId: null,
      source: 'mcp_dcr',
      isVerified: false,
      name: 'Claude',
      homepageUrl: 'https://claude.ai',
      logoUrl: 'https://claude.ai/logo.png',
      redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
    });
    expect(created[0].clientId).toMatch(/^aba_ci_/);
    expect(r).toEqual({
      client_id: created[0].clientId,
      client_id_issued_at: Math.floor(new Date('2026-11-12T10:00:00Z').getTime() / 1000),
      client_name: 'Claude',
      client_uri: 'https://claude.ai',
      logo_uri: 'https://claude.ai/logo.png',
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: FIVE.join(' '),
    });
    expect(r).not.toHaveProperty('client_secret');
  });

  it('omits client_uri / logo_uri when not sent, and stores null', async () => {
    const { svc, created } = build();
    const r = await svc.register(valid, '1.1.1.1');
    expect(created[0]).toMatchObject({ homepageUrl: null, logoUrl: null });
    expect(r).not.toHaveProperty('client_uri');
    expect(r).not.toHaveProperty('logo_uri');
  });

  it('drops exact duplicate redirect URIs', async () => {
    const { svc } = build();
    const r = await svc.register({ ...valid, redirect_uris: ['https://x.pl/cb', 'https://x.pl/cb'] }, '1.1.1.1');
    expect(r.redirect_uris).toEqual(['https://x.pl/cb']);
  });

  it.each([
    'AI Budżet',
    'ai budzet helper',
    'Budżet Pro',
    'AI-BUDGET',
    'My aibudget',
    'BUDŻET',
    'MiCode Connector',
    'mi code',
    'Бюджет помощник',
    'Мой БЮДЖЕТ',
    'АI Вudżet', // Cyrillic А and В
    'AI Budgеt', // Cyrillic е
    'Ai budżеt', // Cyrillic е after ż
    'ΜiCοde', // Greek Μ and ο
    'MiСоde', // Cyrillic С and о
  ])(
    'rejects the look-alike name %s with invalid_client_metadata',
    async (client_name) => {
      const { svc, created } = build();
      const e = await err(svc.register({ ...valid, client_name }, '1.1.1.1'));
      expect(e).toEqual({ status: 400, body: { error: 'invalid_client_metadata', error_description: expect.any(String) } });
      expect(created).toHaveLength(0);
    },
  );

  it.each([undefined, '', '   ', 'x'.repeat(81), 42, 'Line\nbreak', 'Bidi\u202Eoverride'])(
    'rejects client_name %p',
    async (client_name) => {
      const { svc } = build();
      const e = await err(svc.register({ ...valid, client_name }, '1.1.1.1'));
      expect(e.body.error).toBe('invalid_client_metadata');
    },
  );

  it.each(['Claude', 'ChatGPT', 'Budget Helper', 'Помощник по финансам', 'Cursor'])(
    'accepts the ordinary name %s',
    async (client_name) => {
      const { svc } = build();
      const r = await svc.register({ ...valid, client_name }, '1.1.1.1');
      expect(r.client_name).toBe(client_name);
    },
  );

  it('accepts an 80-character name, trimmed', async () => {
    const { svc } = build();
    const r = await svc.register({ ...valid, client_name: ` ${'x'.repeat(80)} ` }, '1.1.1.1');
    expect(r.client_name).toBe('x'.repeat(80));
  });

  it.each([
    ['javascript:alert(1)'],
    ['cursor://anysphere.cursor-retrieval/oauth/callback'],
    ['http://example.com/cb'],
    ['https://x.pl/cb#frag'],
    ['https://x.pl/c\tb'],
    ['https://x.pl/cb\r\n'],
    [' https://x.pl/cb'],
    ['https://x.pl/c b'],
    ['https://x.pl/c\u200Bb'],
  ])('rejects redirect URI %j with invalid_redirect_uri', async (uri) => {
    const { svc, created } = build();
    const e = await err(svc.register({ ...valid, redirect_uris: [uri] }, '1.1.1.1'));
    expect(e).toEqual({ status: 400, body: { error: 'invalid_redirect_uri', error_description: expect.any(String) } });
    expect(created).toHaveLength(0);
  });

  it('accepts loopback redirect URIs on any port, including [::1]', async () => {
    const { svc } = build();
    const uris = ['http://[::1]:5000/cb', 'http://localhost:33418/callback', 'http://127.0.0.1:6274/oauth/callback'];
    const r = await svc.register({ ...valid, redirect_uris: uris }, '1.1.1.1');
    expect(r.redirect_uris).toEqual(uris);
  });

  it('rejects 6 redirect URIs, accepts 5', async () => {
    const { svc } = build();
    const uris = Array.from({ length: 6 }, (_, i) => `https://x.pl/cb${i}`);
    expect((await err(svc.register({ ...valid, redirect_uris: uris }, '1.1.1.1'))).body.error).toBe('invalid_redirect_uri');
    const r = await svc.register({ ...valid, redirect_uris: uris.slice(0, 5) }, '1.1.1.1');
    expect(r.redirect_uris).toHaveLength(5);
  });

  it.each([[undefined], [[]], ['https://x.pl/cb'], [[42]]])('rejects redirect_uris %p', async (redirect_uris) => {
    const { svc } = build();
    expect((await err(svc.register({ ...valid, redirect_uris }, '1.1.1.1'))).body.error).toBe('invalid_redirect_uri');
  });

  it.each([
    { client_uri: 'http://x.pl' },
    { client_uri: 'javascript:alert(1)' },
    { logo_uri: 'http://x.pl/logo.png' },
    { logo_uri: 'data:image/png;base64,AAAA' },
    { logo_uri: 'https://user:pw@x.pl/l.png' },
    { client_uri: 7 },
    { client_uri: 'https://x.pl/\tpath' },
    { client_uri: ' https://x.pl' },
    { logo_uri: 'https://x.pl/l\r\n.png' },
    { logo_uri: 'https://x.pl/l\u0000.png' },
    { token_endpoint_auth_method: 'client_secret_basic' },
    { token_endpoint_auth_method: 'private_key_jwt' },
    { grant_types: ['client_credentials'] },
    { grant_types: ['authorization_code', 'implicit'] },
    { grant_types: ['refresh_token'] },
    { grant_types: 'authorization_code' },
    { response_types: ['token'] },
    { scope: 5 },
  ])('rejects metadata %p with invalid_client_metadata', async (extra) => {
    const { svc, created } = build();
    expect((await err(svc.register({ ...valid, ...extra }, '1.1.1.1'))).body.error).toBe('invalid_client_metadata');
    expect(created).toHaveLength(0);
  });

  it('a non-object body is invalid_client_metadata', async () => {
    const { svc } = build();
    expect((await err(svc.register(undefined as any, '1.1.1.1'))).body.error).toBe('invalid_client_metadata');
    expect((await err(svc.register([] as any, '1.1.1.1'))).body.error).toBe('invalid_client_metadata');
  });

  it('grant_types may be just authorization_code', async () => {
    const { svc } = build();
    const r = await svc.register({ ...valid, grant_types: ['authorization_code'], response_types: ['code'] }, '1.1.1.1');
    expect(r.grant_types).toEqual(['authorization_code']);
  });

  it('drops write and receipt scopes from the returned scope', async () => {
    const { svc } = build();
    const r = await svc.register({ ...valid, scope: 'expenses:read expenses:write receipts:read budgets:read' }, '1.1.1.1');
    expect(r.scope).toBe('expenses:read budgets:read');
  });

  it('a scope with nothing allowed in it falls back to the five read scopes', async () => {
    const { svc } = build();
    const r = await svc.register({ ...valid, scope: 'expenses:write offline_access' }, '1.1.1.1');
    expect(r.scope).toBe(FIVE.join(' '));
  });

  it('the 11th registration from one IP in the window is 429; another IP is unaffected', async () => {
    const { svc, created } = build();
    for (let i = 0; i < DCR_REGISTRATIONS_PER_HOUR; i++) await svc.register(valid, '198.51.100.1');
    const e = await err(svc.register(valid, '198.51.100.1'));
    expect(e.status).toBe(429);
    expect(e.body.error).toBeDefined();
    expect(created).toHaveLength(10);
    await svc.register(valid, '198.51.100.2');
    expect(created).toHaveLength(11);
  });

  it('counts invalid attempts too (the counter runs before validation)', async () => {
    const { svc, cache } = build();
    await err(svc.register({ ...valid, client_name: '' }, '1.1.1.1'));
    expect(cache.incrementWindow).toHaveBeenCalledTimes(1);
  });

  it('fails closed: a Redis error is 429 and nothing is created', async () => {
    const { svc, cache, created } = build();
    cache.incrementWindow.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const e = await err(svc.register(valid, '1.1.1.1'));
    expect(e.status).toBe(429);
    expect(created).toHaveLength(0);
  });

  it('groups IPv6 clients by /64: the 11th registration from one /64 is 429 whatever the host part', async () => {
    const { svc, created, cache } = build();
    for (let i = 0; i < DCR_REGISTRATIONS_PER_HOUR; i++) {
      await svc.register(valid, `2001:db8:aaaa:bbbb:${(i + 1).toString(16)}::${i + 7}`);
    }
    expect(cache.incrementWindow).toHaveBeenCalledWith('oauth:dcr:2001:db8:aaaa:bbbb::/64', 3_600_000);
    const e = await err(svc.register(valid, '2001:db8:aaaa:bbbb:ffff:ffff:ffff:ffff'));
    expect(e.status).toBe(429);
    expect(created).toHaveLength(10);
    // A different /64 is a different bucket.
    await svc.register(valid, '2001:db8:aaaa:bbbc::1');
    expect(created).toHaveLength(11);
  });

  it('an IPv4 client keeps its own address as the key', async () => {
    const { svc, cache } = build();
    await svc.register(valid, '203.0.113.7');
    expect(cache.incrementWindow).toHaveBeenCalledWith('oauth:dcr:203.0.113.7', 3_600_000);
  });

  it('global ceiling: past 300 registrations an hour from all sources, everyone gets 429', async () => {
    const { svc, created, windows } = build();
    windows.set(DCR_GLOBAL_KEY, DCR_REGISTRATIONS_GLOBAL_PER_HOUR - 1);
    await svc.register(valid, '198.51.100.1'); // the 300th
    expect(created).toHaveLength(1);
    const e = await err(svc.register(valid, '198.51.100.2'));
    expect(e.status).toBe(429);
    expect(created).toHaveLength(1);
  });

  it('the global counter counts only valid requests (junk cannot use up the shared budget)', async () => {
    const { svc, cache } = build();
    await err(svc.register({ ...valid, client_name: '' }, '1.1.1.1'));
    expect(cache.incrementWindow).not.toHaveBeenCalledWith(DCR_GLOBAL_KEY, expect.anything());
    await svc.register(valid, '1.1.1.1');
    expect(cache.incrementWindow).toHaveBeenCalledWith(DCR_GLOBAL_KEY, 3_600_000);
  });

  it('fails closed on the global counter too: a Redis error there is 429 and nothing is created', async () => {
    const { svc, cache, created } = build();
    const inner = cache.incrementWindow.getMockImplementation();
    cache.incrementWindow.mockImplementation(async (key: string, ms: number) => {
      if (key === DCR_GLOBAL_KEY) throw new Error('ECONNRESET');
      return inner(key, ms);
    });
    const e = await err(svc.register(valid, '1.1.1.1'));
    expect(e.status).toBe(429);
    expect(created).toHaveLength(0);
  });

  it('the global ceiling is 300 per hour', () => {
    expect(DCR_REGISTRATIONS_GLOBAL_PER_HOUR).toBe(300);
  });

  it('is 10 per hour', () => {
    expect(DCR_REGISTRATIONS_PER_HOUR).toBe(10);
  });
});
