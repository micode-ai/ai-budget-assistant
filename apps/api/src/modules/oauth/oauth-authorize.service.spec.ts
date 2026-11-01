import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { OAuthAuthorizeService, CONNECTED_APPS_URL } from './oauth-authorize.service';
import { sha256Hex } from './oauth-crypto.util';

const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const REDIRECT = 'https://acc.example.com/cb';

const client = {
  id: 'cdb1',
  clientId: 'aba_ci_x',
  name: 'AI Accounting',
  logoUrl: 'https://acc.example.com/logo.png',
  homepageUrl: 'https://acc.example.com',
  privacyPolicyUrl: null,
  isVerified: false,
  status: 'active',
  ownerUserId: 'dev1',
  redirectUris: [REDIRECT, 'http://localhost:5173/cb'],
};

const query = {
  client_id: 'aba_ci_x',
  redirect_uri: REDIRECT,
  scope: 'expenses:read categories:read',
  code_challenge: CHALLENGE,
  code_challenge_method: 'S256',
  response_type: 'code',
};

const approveBody = {
  client_id: 'aba_ci_x',
  redirect_uri: REDIRECT,
  scope: 'expenses:read categories:read',
  state: 'a b&c=d',
  code_challenge: CHALLENGE,
  code_challenge_method: 'S256',
  account_id: 'acc1',
  decision: 'allow' as const,
};

interface Member {
  accountId: string;
  userId: string;
  role: 'owner' | 'editor' | 'viewer';
  account: { id: string; name: string; type: string; encryptionTier: number; isActive?: boolean };
  user: { name: string; email: string; language: string };
}

function build(members: Member[] = []) {
  const redis = new Map<string, { value: any; ttl: number }>();
  const grants: any[] = [];
  const prisma: any = {
    user: { findUnique: jest.fn(async () => ({ name: 'Dev Person' })) },
    accountMember: {
      findMany: jest.fn(),
      findFirst: jest.fn(
        async ({ where }) => members.find((m) => m.userId === where.userId && m.accountId === where.accountId) ?? null,
      ),
    },
  };
  // the userId filter for owners is `{ not: grantorId }`, not a string
  prisma.accountMember.findMany.mockImplementation(async ({ where }: any) =>
    members.filter((m) => {
      if (typeof where.userId === 'string' && m.userId !== where.userId) return false;
      if (where.userId?.not !== undefined && m.userId === where.userId.not) return false;
      if (where.accountId !== undefined && m.accountId !== where.accountId) return false;
      if (where.role !== undefined && m.role !== where.role) return false;
      return true;
    }),
  );
  const clients: any = { findActiveByClientId: jest.fn(async (id: string) => (id === client.clientId ? { ...client } : null)) };
  const grantsSvc: any = {
    upsertActive: jest.fn(async (clientDbId: string, userId: string, accountId: string, scopes: string[]) => {
      const existing = grants.find((g) => g.clientId === clientDbId && g.userId === userId && g.accountId === accountId);
      if (existing) {
        existing.scopes = scopes;
        return { grant: existing, isNew: false };
      }
      const grant = { id: `g${grants.length + 1}`, clientId: clientDbId, userId, accountId, scopes };
      grants.push(grant);
      return { grant, isNew: true };
    }),
  };
  const cache: any = {
    setStrict: jest.fn(async (key: string, value: any, ttl: number) => {
      redis.set(key, { value, ttl });
    }),
    setIfAbsentStrict: jest.fn(async (key: string, ttl: number) => {
      if (redis.has(key)) return false;
      redis.set(key, { value: '1', ttl });
      return true;
    }),
  };
  const mail: any = { sendAppConnectedEmail: jest.fn().mockResolvedValue(true) };
  const svc = new OAuthAuthorizeService(prisma, clients, grantsSvc, cache, mail);
  return { svc, prisma, clients, grantsSvc, cache, mail, redis, grants };
}

const member = (userId: string, role: Member['role'], tier = 0, accountId = 'acc1', lang = 'en'): Member => ({
  accountId,
  userId,
  role,
  account: { id: accountId, name: `Account ${accountId}`, type: 'business', encryptionTier: tier },
  user: { name: `Name ${userId}`, email: `${userId}@x.pl`, language: lang },
});

const flush = () => new Promise((r) => setImmediate(r));

async function expectOAuthError(p: Promise<unknown>, status: 'bad' | 'forbidden', error: string) {
  const err: any = await p.then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(status === 'bad' ? BadRequestException : ForbiddenException);
  expect(err.getResponse()).toMatchObject({ error });
}

describe('OAuthAuthorizeService.preview', () => {
  it('returns app, scopes and accounts', async () => {
    const { svc } = build([member('u1', 'owner')]);
    const r = await svc.preview('u1', query);
    expect(r.app).toEqual({
      name: 'AI Accounting',
      logoUrl: client.logoUrl,
      homepageUrl: client.homepageUrl,
      privacyPolicyUrl: null,
      isVerified: false,
      developerName: 'Dev Person',
    });
    expect(r.scopes).toEqual(['expenses:read', 'categories:read']);
    expect(r.accounts).toEqual([
      { id: 'acc1', name: 'Account acc1', type: 'business', role: 'owner', selectable: true, reason: null, readOnly: false },
    ]);
  });

  it('missing client_id → invalid_request', async () => {
    const { svc } = build();
    await expectOAuthError(svc.preview('u1', { ...query, client_id: undefined }), 'bad', 'invalid_request');
  });

  it('unknown client → invalid_client', async () => {
    const { svc } = build();
    await expectOAuthError(svc.preview('u1', { ...query, client_id: 'nope' }), 'bad', 'invalid_client');
  });

  it('blocked client → invalid_client', async () => {
    const { svc, clients } = build();
    clients.findActiveByClientId.mockResolvedValue({ ...client, status: 'blocked' });
    await expectOAuthError(svc.preview('u1', query), 'bad', 'invalid_client');
  });

  it('unregistered redirect → invalid_redirect_uri', async () => {
    const { svc } = build();
    await expectOAuthError(svc.preview('u1', { ...query, redirect_uri: 'https://evil.example/cb' }), 'bad', 'invalid_redirect_uri');
  });

  it('redirect must match exactly (no prefix / trailing slash match)', async () => {
    const { svc } = build();
    await expectOAuthError(svc.preview('u1', { ...query, redirect_uri: `${REDIRECT}/` }), 'bad', 'invalid_redirect_uri');
    await expectOAuthError(svc.preview('u1', { ...query, redirect_uri: `${REDIRECT}?x=1` }), 'bad', 'invalid_redirect_uri');
  });

  it('response_type other than code → unsupported_response_type', async () => {
    const { svc } = build();
    await expectOAuthError(svc.preview('u1', { ...query, response_type: 'token' }), 'bad', 'unsupported_response_type');
  });

  it('missing response_type → invalid_request', async () => {
    const { svc } = build();
    await expectOAuthError(svc.preview('u1', { ...query, response_type: undefined }), 'bad', 'invalid_request');
  });

  it('code_challenge_method=plain → invalid_request', async () => {
    const { svc } = build();
    await expectOAuthError(svc.preview('u1', { ...query, code_challenge_method: 'plain' }), 'bad', 'invalid_request');
  });

  it('missing code_challenge → invalid_request', async () => {
    const { svc } = build();
    await expectOAuthError(svc.preview('u1', { ...query, code_challenge: undefined }), 'bad', 'invalid_request');
  });

  it('malformed code_challenge → invalid_request', async () => {
    const { svc } = build();
    await expectOAuthError(svc.preview('u1', { ...query, code_challenge: 'short' }), 'bad', 'invalid_request');
  });

  it('unknown scope → invalid_scope', async () => {
    const { svc } = build();
    await expectOAuthError(svc.preview('u1', { ...query, scope: 'expenses:read admin' }), 'bad', 'invalid_scope');
  });

  it('viewer account is listed but not selectable', async () => {
    const { svc } = build([member('u1', 'viewer')]);
    const [a] = (await svc.preview('u1', query)).accounts;
    expect(a).toMatchObject({ role: 'viewer', selectable: false, reason: 'viewer' });
  });

  it('tier 2 account is not selectable (encrypted)', async () => {
    const { svc } = build([member('u1', 'owner', 2)]);
    const [a] = (await svc.preview('u1', query)).accounts;
    expect(a).toMatchObject({ selectable: false, reason: 'encrypted' });
  });

  it('tier 1 account is selectable but read-only', async () => {
    const { svc } = build([member('u1', 'editor', 1)]);
    const [a] = (await svc.preview('u1', query)).accounts;
    expect(a).toMatchObject({ selectable: true, readOnly: true, reason: null });
  });

  it('lists only the caller memberships of active accounts', async () => {
    const { svc, prisma } = build([member('u1', 'owner')]);
    await svc.preview('u1', query);
    expect(prisma.accountMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', account: { isActive: true } } }),
    );
  });
});

describe('OAuthAuthorizeService.approve', () => {
  it('allow stores a hashed, 600 s, single-use code with the ruling-2 payload and echoes state', async () => {
    const { svc, redis } = build([member('u1', 'owner')]);
    const { redirectTo } = await svc.approve('u1', approveBody);
    const url = new URL(redirectTo);
    expect(`${url.origin}${url.pathname}`).toBe(REDIRECT);
    const code = url.searchParams.get('code')!;
    expect(code).toMatch(/^aba_ac_[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('state')).toBe('a b&c=d');
    expect(redirectTo).not.toContain('a b&c=d');

    const entry = redis.get(`oauth:code:${sha256Hex(code)}`);
    expect(entry).toBeDefined();
    expect(entry!.ttl).toBe(600);
    expect(entry!.value).toEqual({
      grantId: 'g1',
      clientDbId: 'cdb1',
      redirectUri: REDIRECT,
      codeChallenge: CHALLENGE,
      scopes: ['expenses:read', 'categories:read'],
    });
    expect(redis.has(`oauth:code:${code}`)).toBe(false);
  });

  it('allow without state omits the state param', async () => {
    const { svc } = build([member('u1', 'owner')]);
    const { redirectTo } = await svc.approve('u1', { ...approveBody, state: undefined });
    expect(new URL(redirectTo).searchParams.has('state')).toBe(false);
  });

  it('keeps an existing query string on the registered redirect URI', async () => {
    const { svc, clients } = build([member('u1', 'owner')]);
    clients.findActiveByClientId.mockResolvedValue({ ...client, redirectUris: ['https://acc.example.com/cb?tenant=7'] });
    const { redirectTo } = await svc.approve('u1', { ...approveBody, redirect_uri: 'https://acc.example.com/cb?tenant=7' });
    const url = new URL(redirectTo);
    expect(url.searchParams.get('tenant')).toBe('7');
    expect(url.searchParams.get('code')).toMatch(/^aba_ac_/);
  });

  it('deny returns error=access_denied with state and stores nothing', async () => {
    const { svc, redis, grantsSvc } = build([member('u1', 'owner')]);
    const { redirectTo } = await svc.approve('u1', { ...approveBody, decision: 'deny' });
    const url = new URL(redirectTo);
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('state')).toBe('a b&c=d');
    expect(url.searchParams.has('code')).toBe(false);
    expect(redis.size).toBe(0);
    expect(grantsSvc.upsertActive).not.toHaveBeenCalled();
  });

  it('deny still refuses an unregistered redirect URI (never redirect to an unverified URI)', async () => {
    const { svc } = build([member('u1', 'owner')]);
    await expectOAuthError(
      svc.approve('u1', { ...approveBody, decision: 'deny', redirect_uri: 'https://evil.example/cb' }),
      'bad',
      'invalid_redirect_uri',
    );
  });

  it('allow re-validates the request (plain PKCE refused)', async () => {
    const { svc } = build([member('u1', 'owner')]);
    await expectOAuthError(svc.approve('u1', { ...approveBody, code_challenge_method: 'plain' }), 'bad', 'invalid_request');
  });

  it('allow on a blocked client → invalid_client', async () => {
    const { svc, clients } = build([member('u1', 'owner')]);
    clients.findActiveByClientId.mockResolvedValue({ ...client, status: 'blocked' });
    await expectOAuthError(svc.approve('u1', approveBody), 'bad', 'invalid_client');
  });

  it('allow without account_id → invalid_request', async () => {
    const { svc } = build([member('u1', 'owner')]);
    await expectOAuthError(svc.approve('u1', { ...approveBody, account_id: undefined }), 'bad', 'invalid_request');
  });

  it('approve as viewer → 403', async () => {
    const { svc, grantsSvc } = build([member('u1', 'viewer')]);
    await expect(svc.approve('u1', approveBody)).rejects.toBeInstanceOf(ForbiddenException);
    expect(grantsSvc.upsertActive).not.toHaveBeenCalled();
  });

  it('approve on an account the user is not a member of → 403', async () => {
    const { svc, grantsSvc } = build([member('u2', 'owner')]);
    await expect(svc.approve('u1', approveBody)).rejects.toBeInstanceOf(ForbiddenException);
    expect(grantsSvc.upsertActive).not.toHaveBeenCalled();
  });

  it('membership lookup requires an active account', async () => {
    const { svc, prisma } = build([member('u1', 'owner')]);
    await svc.approve('u1', approveBody);
    expect(prisma.accountMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', accountId: 'acc1', account: { isActive: true } } }),
    );
  });

  it('approve on a tier 2 account → 403 account_encrypted', async () => {
    const { svc } = build([member('u1', 'owner', 2)]);
    await expectOAuthError(svc.approve('u1', approveBody), 'forbidden', 'account_encrypted');
  });

  it('Redis down while storing the code → 503, not a redirect with a dead code', async () => {
    const { svc, cache } = build([member('u1', 'owner')]);
    cache.setStrict.mockRejectedValue(new Error('connection lost'));
    await expect(svc.approve('u1', approveBody)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('second approve for the same (client,user,account) reuses the grant and replaces scopes', async () => {
    const { svc, grants, redis } = build([member('u1', 'owner')]);
    await svc.approve('u1', approveBody);
    const { redirectTo } = await svc.approve('u1', { ...approveBody, scope: 'receipts:read' });
    expect(grants).toHaveLength(1);
    expect(grants[0].scopes).toEqual(['receipts:read']);
    const code = new URL(redirectTo).searchParams.get('code')!;
    expect(redis.get(`oauth:code:${sha256Hex(code)}`)!.value).toMatchObject({ grantId: 'g1', scopes: ['receipts:read'] });
  });
});

describe('OAuthAuthorizeService connection e-mails', () => {
  it('editor grant e-mails the grantor and every owner, each in their own language', async () => {
    const { svc, mail } = build([
      member('ed', 'editor', 0, 'acc1', 'pl'),
      member('o1', 'owner', 0, 'acc1', 'de'),
      member('o2', 'owner', 0, 'acc1', 'xx'),
      member('o3', 'owner', 0, 'other'),
    ]);
    await svc.approve('ed', approveBody);
    await flush();
    const calls = mail.sendAppConnectedEmail.mock.calls.map((c: any[]) => c[0]);
    expect(calls.map((c: any) => [c.to, c.lang]).sort()).toEqual([
      ['ed@x.pl', 'pl'],
      ['o1@x.pl', 'de'],
      ['o2@x.pl', 'xx'],
    ]);
    for (const c of calls) {
      expect(c).toMatchObject({
        appName: 'AI Accounting',
        accountName: 'Account acc1',
        connectedByName: 'Name ed',
        manageUrl: CONNECTED_APPS_URL,
      });
    }
    expect(CONNECTED_APPS_URL).toBe('https://app.ai-budget.pl/settings/connected-apps');
  });

  it('owner grant e-mails only the owner who connected it', async () => {
    const { svc, mail } = build([member('o1', 'owner'), member('o2', 'owner')]);
    await svc.approve('o1', approveBody);
    await flush();
    expect(mail.sendAppConnectedEmail).toHaveBeenCalledTimes(1);
    expect(mail.sendAppConnectedEmail.mock.calls[0][0].to).toBe('o1@x.pl');
  });

  it('re-approval sends no e-mail', async () => {
    const { svc, mail } = build([member('o1', 'owner')]);
    await svc.approve('o1', approveBody);
    await flush();
    mail.sendAppConnectedEmail.mockClear();
    await svc.approve('o1', approveBody);
    await flush();
    expect(mail.sendAppConnectedEmail).not.toHaveBeenCalled();
  });

  it('connect, disconnect, connect again the same day sends the e-mail once per (app, account)', async () => {
    const { svc, mail, cache, grants } = build([member('o1', 'owner')]);
    await svc.approve('o1', approveBody);
    await flush();
    grants.length = 0; // the user disconnected: the next approve creates a new grant
    await svc.approve('o1', approveBody);
    await flush();
    expect(mail.sendAppConnectedEmail).toHaveBeenCalledTimes(1);
    const key = cache.setIfAbsentStrict.mock.calls[0][0] as string;
    expect(key).toMatch(/^oauth:mail:connected:.+:acc1$/);
    expect(cache.setIfAbsentStrict.mock.calls[0][1]).toBe(86400);
  });

  it('a Redis outage on the dedupe key still sends the e-mail (never dropped silently)', async () => {
    const { svc, mail, cache } = build([member('o1', 'owner')]);
    cache.setIfAbsentStrict.mockRejectedValue(new Error('connection lost'));
    await svc.approve('o1', approveBody);
    await flush();
    expect(mail.sendAppConnectedEmail).toHaveBeenCalledTimes(1);
  });

  it('a failing e-mail does not fail the approve', async () => {
    const { svc, mail } = build([member('o1', 'owner')]);
    mail.sendAppConnectedEmail.mockRejectedValue(new Error('smtp down'));
    await expect(svc.approve('o1', approveBody)).resolves.toHaveProperty('redirectTo');
    await flush();
  });
});
