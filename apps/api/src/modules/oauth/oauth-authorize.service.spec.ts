import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { OAuthAuthorizeService, CONNECTED_APPS_URL, redirectHostOf } from './oauth-authorize.service';
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

const MCP = 'https://api.ai-budget.pl/mcp';
const MCP_ON = { PUBLIC_API_ENABLED: 'true', MCP_ENABLED: 'true' };

const dcrClient = {
  ...client,
  id: 'cdb9',
  clientId: 'aba_ci_dcr',
  name: 'Some Assistant',
  ownerUserId: null,
  source: 'mcp_dcr',
};

function build(
  members: Member[] = [],
  connectedAccountIds: string[] = [],
  opts: { env?: Record<string, string> } = {},
) {
  const redis = new Map<string, { value: any; ttl: number }>();
  const grants: any[] = [];
  const prisma: any = {
    oAuthGrantAccount: { findMany: jest.fn(async () => connectedAccountIds.map((accountId) => ({ accountId }))) },
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
  const known: any[] = [client, dcrClient];
  const clients: any = {
    findActiveByClientId: jest.fn(async (id: string) => {
      const c = known.find((x) => x.clientId === id);
      return c ? { ...c } : null;
    }),
  };
  const grantsSvc: any = {
    replaceActive: jest.fn(async (clientDbId: string, userId: string, accountIds: string[], scopes: string[]) => {
      const existing = grants.find((g) => g.clientId === clientDbId && g.userId === userId);
      if (existing) {
        const addedAccountIds = accountIds.filter((id) => !existing.accountIds.includes(id));
        existing.accountIds = accountIds;
        existing.scopes = scopes;
        return { grant: existing, isNew: false, addedAccountIds };
      }
      const grant = { id: `g${grants.length + 1}`, clientId: clientDbId, userId, accountIds, scopes };
      grants.push(grant);
      return { grant, isNew: true, addedAccountIds: [...accountIds] };
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
  const env: Record<string, string> = opts.env ?? { PUBLIC_API_ENABLED: 'true' };
  const config: any = { get: (k: string) => env[k] };
  const svc = new OAuthAuthorizeService(prisma, clients, grantsSvc, cache, mail, config);
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
      registeredByAssistant: false,
      redirectHost: null,
    });
    expect(r.scopes).toEqual(['expenses:read', 'categories:read']);
    expect(r.accounts).toEqual([
      { id: 'acc1', name: 'Account acc1', type: 'business', role: 'owner', selectable: true, reason: null, readOnly: false, connected: false },
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

describe('OAuthAuthorizeService.preview connected accounts', () => {
  it('marks the accounts of the caller active grant for this client as connected', async () => {
    const { svc, prisma } = build([member('u1', 'owner', 0, 'A'), member('u1', 'owner', 0, 'B')], ['A']);
    const r = await svc.preview('u1', query);
    expect(r.accounts.map((a) => [a.id, a.connected])).toEqual([
      ['A', true],
      ['B', false],
    ]);
    expect(prisma.oAuthGrantAccount.findMany).toHaveBeenCalledWith({
      where: { grant: { clientId: 'cdb1', userId: 'u1', revokedAt: null } },
      select: { accountId: true },
    });
  });

  it('another client grant marks nothing (the lookup is scoped to this client)', async () => {
    const { svc } = build([member('u1', 'owner', 0, 'A')], []);
    const r = await svc.preview('u1', query);
    expect(r.accounts[0].connected).toBe(false);
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
    expect(grantsSvc.replaceActive).not.toHaveBeenCalled();
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

  it('allow without account_id or account_ids → invalid_request', async () => {
    const { svc } = build([member('u1', 'owner')]);
    await expectOAuthError(svc.approve('u1', { ...approveBody, account_id: undefined }), 'bad', 'invalid_request');
  });

  it('account_ids: [] → invalid_request and no grant', async () => {
    const { svc, grantsSvc } = build([member('u1', 'owner')]);
    await expectOAuthError(svc.approve('u1', { ...approveBody, account_id: undefined, account_ids: [] }), 'bad', 'invalid_request');
    expect(grantsSvc.replaceActive).not.toHaveBeenCalled();
  });

  it('account_ids [A, B] → replaceActive(client, user, [A, B], scopes)', async () => {
    const { svc, grantsSvc } = build([member('u1', 'owner', 0, 'A'), member('u1', 'editor', 0, 'B')]);
    await svc.approve('u1', { ...approveBody, account_id: undefined, account_ids: ['A', 'B'] });
    expect(grantsSvc.replaceActive).toHaveBeenCalledWith('cdb1', 'u1', ['A', 'B'], ['expenses:read', 'categories:read']);
  });

  it('account_ids are de-duplicated', async () => {
    const { svc, grantsSvc } = build([member('u1', 'owner', 0, 'A')]);
    await svc.approve('u1', { ...approveBody, account_id: undefined, account_ids: ['A', 'A'] });
    expect(grantsSvc.replaceActive.mock.calls[0][2]).toEqual(['A']);
  });

  it('the phase 1 account_id alone still works', async () => {
    const { svc, grantsSvc } = build([member('u1', 'owner', 0, 'A')]);
    await svc.approve('u1', { ...approveBody, account_id: 'A' });
    expect(grantsSvc.replaceActive.mock.calls[0][2]).toEqual(['A']);
  });

  it('one viewer account in the list refuses the whole approve (no partial grant)', async () => {
    const { svc, grantsSvc } = build([member('u1', 'owner', 0, 'A'), member('u1', 'viewer', 0, 'V')]);
    await expect(svc.approve('u1', { ...approveBody, account_id: undefined, account_ids: ['A', 'V'] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(grantsSvc.replaceActive).not.toHaveBeenCalled();
  });

  it('one tier 2 account in the list → 403 account_encrypted, no grant', async () => {
    const { svc, grantsSvc } = build([member('u1', 'owner', 0, 'A'), member('u1', 'owner', 2, 'T')]);
    await expectOAuthError(svc.approve('u1', { ...approveBody, account_id: undefined, account_ids: ['A', 'T'] }), 'forbidden', 'account_encrypted');
    expect(grantsSvc.replaceActive).not.toHaveBeenCalled();
  });

  it('approve as viewer → 403', async () => {
    const { svc, grantsSvc } = build([member('u1', 'viewer')]);
    await expect(svc.approve('u1', approveBody)).rejects.toBeInstanceOf(ForbiddenException);
    expect(grantsSvc.replaceActive).not.toHaveBeenCalled();
  });

  it('approve on an account the user is not a member of → 403', async () => {
    const { svc, grantsSvc } = build([member('u2', 'owner')]);
    await expect(svc.approve('u1', approveBody)).rejects.toBeInstanceOf(ForbiddenException);
    expect(grantsSvc.replaceActive).not.toHaveBeenCalled();
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
        accountNames: ['Account acc1'],
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

describe('OAuthAuthorizeService multi-account e-mails', () => {
  const names = (mail: any) =>
    mail.sendAppConnectedEmail.mock.calls.map((c: any[]) => [c[0].to, c[0].accountNames]).sort();
  const multi = () => [
    member('g', 'owner', 0, 'P'),
    member('g', 'editor', 0, 'S'),
    member('o', 'owner', 0, 'S'),
    member('o', 'owner', 0, 'P'),
  ];
  const ids = { ...approveBody, account_id: undefined };

  it('new grant [P owner, S editor]: grantor lists both, the owner of S only S', async () => {
    const { svc, mail } = build(multi());
    await svc.approve('g', { ...ids, account_ids: ['P', 'S'] });
    await flush();
    // 'o' owns P too, but P is the grantor's own account, so only S reaches o
    expect(names(mail)).toEqual([
      ['g@x.pl', ['Account P', 'Account S']],
      ['o@x.pl', ['Account S']],
    ]);
  });

  it('re-consent adding T mails only T when P and S are still deduped', async () => {
    const { svc, mail } = build([...multi(), member('g', 'owner', 0, 'T')]);
    await svc.approve('g', { ...ids, account_ids: ['P', 'S'] });
    await flush();
    mail.sendAppConnectedEmail.mockClear();
    await svc.approve('g', { ...ids, account_ids: ['P', 'S', 'T'] });
    await flush();
    expect(names(mail)).toEqual([['g@x.pl', ['Account T']]]);
  });

  it('re-consent with nothing added sends no e-mail', async () => {
    const { svc, mail } = build(multi());
    await svc.approve('g', { ...ids, account_ids: ['P', 'S'] });
    await flush();
    mail.sendAppConnectedEmail.mockClear();
    await svc.approve('g', { ...ids, account_ids: ['P'] });
    await flush();
    expect(mail.sendAppConnectedEmail).not.toHaveBeenCalled();
  });

  it('a dedupe key already taken for P leaves only S in the grantor e-mail', async () => {
    const { svc, mail, redis } = build(multi());
    redis.set('oauth:mail:connected:cdb1:P', { value: '1', ttl: 1 });
    await svc.approve('g', { ...ids, account_ids: ['P', 'S'] });
    await flush();
    expect(names(mail)).toEqual([
      ['g@x.pl', ['Account S']],
      ['o@x.pl', ['Account S']],
    ]);
  });
});

describe('OAuthAuthorizeService resource and the registered-assistant scope policy', () => {
  // R4: a registered assistant always names the MCP resource.
  const dcrQuery = { ...query, client_id: dcrClient.clientId, scope: undefined, resource: MCP };
  const dcrApprove = { ...approveBody, client_id: dcrClient.clientId, scope: undefined, resource: MCP };

  it('DCR client without scope gets MCP_DEFAULT_SCOPES (preview and approve)', async () => {
    const { svc, grantsSvc } = build([member('u1', 'owner')], [], { env: MCP_ON });
    const r = await svc.preview('u1', dcrQuery);
    expect(r.scopes).toEqual(['expenses:read', 'categories:read', 'incomes:read', 'budgets:read', 'analytics:read']);
    await svc.approve('u1', dcrApprove);
    expect(grantsSvc.replaceActive).toHaveBeenCalledWith('cdb9', 'u1', ['acc1'], [
      'expenses:read',
      'categories:read',
      'incomes:read',
      'budgets:read',
      'analytics:read',
    ]);
  });

  it('preview returns registeredByAssistant for an mcp_dcr client (no developer name)', async () => {
    const { svc } = build([member('u1', 'owner')], [], { env: MCP_ON });
    const r = await svc.preview('u1', dcrQuery);
    expect(r.app.registeredByAssistant).toBe(true);
    expect(r.app.isVerified).toBe(false);
    expect(r.app.developerName).toBeNull();
    // R11: where the code will go, from the validated redirect_uri of this request
    expect(r.app.redirectHost).toBe(new URL(dcrQuery.redirect_uri).hostname);
  });

  it('R11: a manual client preview carries no redirectHost', async () => {
    const { svc } = build([member('u1', 'owner')], [], { env: MCP_ON });
    const r = await svc.preview('u1', query);
    expect(r.app.redirectHost).toBeNull();
  });

  it('R11: redirectHostOf returns the punycode host, never the Unicode one', () => {
    expect(redirectHostOf('https://claude.ai/api/mcp/auth_callback')).toBe('claude.ai');
    expect(redirectHostOf('https://аpple.com/cb')).toBe('xn--pple-43d.com');
    expect(redirectHostOf('HTTPS://München.DE/cb')).toBe('xn--mnchen-3ya.de');
    expect(redirectHostOf('http://127.0.0.1:3000/cb')).toBe('127.0.0.1');
    expect(redirectHostOf('http://[::1]:8080/cb')).toBe('[::1]');
    expect(redirectHostOf('not a url')).toBeNull();
  });

  it('a DCR client may narrow to a subset of the read scopes', async () => {
    const { svc } = build([member('u1', 'owner')], [], { env: MCP_ON });
    const r = await svc.preview('u1', { ...dcrQuery, scope: 'expenses:read' });
    expect(r.scopes).toEqual(['expenses:read']);
  });

  it('a DCR client asking for a write scope or receipts:read is invalid_scope (preview and approve)', async () => {
    const { svc, grantsSvc } = build([member('u1', 'owner')], [], { env: MCP_ON });
    for (const scope of ['expenses:read expenses:write', 'receipts:read', 'budgets:write']) {
      await expectOAuthError(svc.preview('u1', { ...dcrQuery, scope }), 'bad', 'invalid_scope');
      await expectOAuthError(svc.approve('u1', { ...dcrApprove, scope }), 'bad', 'invalid_scope');
    }
    expect(grantsSvc.replaceActive).not.toHaveBeenCalled();
  });

  it('manual client without scope still invalid_scope', async () => {
    const { svc } = build([member('u1', 'owner')]);
    await expectOAuthError(svc.preview('u1', { ...query, scope: undefined }), 'bad', 'invalid_scope');
    await expectOAuthError(svc.approve('u1', { ...approveBody, scope: undefined }), 'bad', 'invalid_scope');
  });

  it('a manual client may still ask for write and receipt scopes', async () => {
    const { svc } = build([member('u1', 'owner')]);
    const r = await svc.preview('u1', { ...query, scope: 'expenses:write receipts:read' });
    expect(r.scopes).toEqual(['expenses:write', 'receipts:read']);
  });

  it('resource stored in the code payload, normalized to exactly MCP_RESOURCE_URL', async () => {
    const { svc, redis } = build([member('u1', 'owner')], [], { env: MCP_ON });
    const { redirectTo } = await svc.approve('u1', { ...dcrApprove, resource: 'HTTPS://API.AI-BUDGET.PL/mcp/' });
    const code = new URL(redirectTo).searchParams.get('code')!;
    expect(redis.get(`oauth:code:${sha256Hex(code)}`)!.value.resource).toBe(MCP);
  });

  it('no resource stores no binding (the public API, as before)', async () => {
    const { svc, redis } = build([member('u1', 'owner')], [], { env: MCP_ON });
    const { redirectTo } = await svc.approve('u1', approveBody);
    const code = new URL(redirectTo).searchParams.get('code')!;
    expect(redis.get(`oauth:code:${sha256Hex(code)}`)!.value.resource ?? null).toBeNull();
  });

  it('an unknown resource is invalid_target (preview and approve), nothing stored', async () => {
    const { svc, redis, grantsSvc } = build([member('u1', 'owner')], [], { env: MCP_ON });
    for (const resource of ['https://evil.example.com/mcp', 'https://api.ai-budget.pl/public/v2', 'nope']) {
      await expectOAuthError(svc.preview('u1', { ...query, resource }), 'bad', 'invalid_target');
      await expectOAuthError(svc.approve('u1', { ...approveBody, resource }), 'bad', 'invalid_target');
    }
    expect(grantsSvc.replaceActive).not.toHaveBeenCalled();
    expect(redis.size).toBe(0);
  });

  it('R10: the public API identifiers bind null at preview and approve (MCP on or off)', async () => {
    for (const env of [MCP_ON, { PUBLIC_API_ENABLED: 'true' }]) {
      for (const resource of ['https://api.ai-budget.pl', 'https://api.ai-budget.pl/public/v1', 'HTTPS://API.AI-BUDGET.PL/public/v1/']) {
        const { svc, redis } = build([member('u1', 'owner')], [], { env });
        await expect(svc.preview('u1', { ...query, resource })).resolves.toBeDefined();
        const { redirectTo } = await svc.approve('u1', { ...approveBody, resource });
        const code = new URL(redirectTo).searchParams.get('code')!;
        expect(redis.get(`oauth:code:${sha256Hex(code)}`)!.value.resource ?? null).toBeNull();
      }
    }
  });

  it('R10 + R4: a DCR client naming the public API is still invalid_target', async () => {
    const { svc, grantsSvc } = build([member('u1', 'owner')], [], { env: MCP_ON });
    await expectOAuthError(svc.preview('u1', { ...dcrQuery, resource: 'https://api.ai-budget.pl/public/v1' }), 'bad', 'invalid_target');
    await expectOAuthError(svc.approve('u1', { ...dcrApprove, resource: 'https://api.ai-budget.pl' }), 'bad', 'invalid_target');
    expect(grantsSvc.replaceActive).not.toHaveBeenCalled();
  });

  it('R4: a DCR client without resource is invalid_target (preview and approve), nothing stored', async () => {
    const { svc, redis, grantsSvc } = build([member('u1', 'owner')], [], { env: MCP_ON });
    for (const resource of [undefined, '', '  ']) {
      await expectOAuthError(svc.preview('u1', { ...dcrQuery, resource }), 'bad', 'invalid_target');
      await expectOAuthError(svc.approve('u1', { ...dcrApprove, resource }), 'bad', 'invalid_target');
    }
    expect(grantsSvc.replaceActive).not.toHaveBeenCalled();
    expect(redis.size).toBe(0);
  });

  it('R4: a DCR client naming the MCP resource is bound to it', async () => {
    const { svc, redis } = build([member('u1', 'owner')], [], { env: MCP_ON });
    const { redirectTo } = await svc.approve('u1', dcrApprove);
    const code = new URL(redirectTo).searchParams.get('code')!;
    expect(redis.get(`oauth:code:${sha256Hex(code)}`)!.value.resource).toBe(MCP);
  });

  it('R4: a DCR deny still redirects with access_denied (no resource needed to refuse)', async () => {
    const { svc } = build([member('u1', 'owner')], [], { env: MCP_ON });
    const { redirectTo } = await svc.approve('u1', { ...dcrApprove, resource: undefined, decision: 'deny' });
    expect(new URL(redirectTo).searchParams.get('error')).toBe('access_denied');
  });

  it('MCP resource refused when MCP_ENABLED is off', async () => {
    const { svc, grantsSvc } = build([member('u1', 'owner')], [], { env: { PUBLIC_API_ENABLED: 'true' } });
    await expectOAuthError(svc.preview('u1', { ...dcrQuery, resource: MCP }), 'bad', 'invalid_target');
    await expectOAuthError(svc.approve('u1', { ...dcrApprove, resource: MCP }), 'bad', 'invalid_target');
    expect(grantsSvc.replaceActive).not.toHaveBeenCalled();
  });
});
