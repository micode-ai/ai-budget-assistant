import type { CacheService } from '../../common/cache/cache.service';
import type { PrismaService } from '../../database/prisma.service';
import { PublicApiAuthorizer, resolveAccountId, type AuthorizeOptions } from './public-api-authorizer.service';
import { PublicApiError } from './public-api-error';
import type { PublicApiRateLimitService } from './public-api-rate-limit.service';

const MCP = 'https://api.ai-budget.pl/mcp';
const TOKEN = 'aba_at_good-token';

function grantAccount(accountId: string, encryptionTier = 0, monthAnchorDay: number | null = null) {
  return { accountId, account: { encryptionTier, monthAnchorDay } };
}

function baseRow(resource: string | null = null) {
  return {
    kind: 'access',
    expiresAt: new Date(Date.now() + 3_600_000),
    resource,
    grant: {
      id: 'grant-1',
      userId: 'user-1',
      scopes: ['expenses:read', 'categories:read'],
      revokedAt: null as Date | null,
      client: {
        id: 'client-db-1',
        name: 'Claude',
        status: 'active',
        deletedAt: null as Date | null,
        rateLimitPerGrant: null as number | null,
        rateLimitPerClient: null as number | null,
      },
      user: {
        id: 'user-1',
        email: 'u@example.com',
        name: 'U',
        currencyCode: 'PLN',
        timezone: 'Europe/Warsaw',
        defaultAccountId: 'acc-1',
        isActive: true,
      },
      accounts: [grantAccount('acc-1', 0, 10)],
    },
  };
}

describe('PublicApiAuthorizer', () => {
  let row: ReturnType<typeof baseRow> | null;
  let roles: Record<string, string | null>;
  let rate: { limit: number; remaining: number; retryAfterSec?: number };

  const prisma = {
    oAuthToken: { findUnique: jest.fn(async (_args?: unknown) => row) },
    accountMember: {
      findUnique: jest.fn(async (args: any) => {
        const role = roles[args.where.accountId_userId.accountId];
        return role ? { role } : null;
      }),
    },
    oAuthGrant: { updateMany: jest.fn(async (_args?: unknown) => ({ count: 1 })) },
  };
  const cache = { setIfAbsent: jest.fn(async (_k?: string, _t?: number) => true) };
  const rateLimit = { check: jest.fn(async (_g?: string, _c?: string, _o?: unknown) => rate) };
  const authorizer = new PublicApiAuthorizer(
    prisma as unknown as PrismaService,
    cache as unknown as CacheService,
    rateLimit as unknown as PublicApiRateLimitService,
  );

  const opts = (o: Partial<AuthorizeOptions> = {}): AuthorizeOptions => ({
    requiredScopes: ['expenses:read'],
    tokenOnly: false,
    connectionLevel: false,
    accountId: null,
    resource: null,
    ...o,
  });

  const rejection = async (p: Promise<unknown>): Promise<PublicApiError> => {
    try {
      await p;
    } catch (e) {
      expect(e).toBeInstanceOf(PublicApiError);
      return e as PublicApiError;
    }
    throw new Error('expected a rejection');
  };

  beforeEach(() => {
    row = baseRow();
    roles = { 'acc-1': 'editor', 'acc-2': 'editor' };
    rate = { limit: 120, remaining: 119 };
    jest.clearAllMocks();
  });

  describe('resource binding', () => {
    it('token with resource MCP_RESOURCE_URL is invalid_token when opts.resource is null', async () => {
      row = baseRow(MCP);
      const err = await rejection(authorizer.authorize(TOKEN, opts({ resource: null })));
      expect(err.getStatus()).toBe(401);
      expect(err.code).toBe('invalid_token');
      expect((err as PublicApiError & { wwwAuthenticate?: string }).wwwAuthenticate).toBe('Bearer error="invalid_token"');
      expect(rateLimit.check).not.toHaveBeenCalled();
    });

    it('token without resource is invalid_token when opts.resource is the MCP URL', async () => {
      row = baseRow(null);
      const err = await rejection(authorizer.authorize(TOKEN, opts({ resource: MCP })));
      expect(err.code).toBe('invalid_token');
      expect(rateLimit.check).not.toHaveBeenCalled();
    });

    it('a token row with no resource field at all reads as null (public API only)', async () => {
      const legacy = baseRow() as Partial<ReturnType<typeof baseRow>>;
      delete legacy.resource;
      row = legacy as ReturnType<typeof baseRow>;
      await expect(authorizer.authorize(TOKEN, opts())).resolves.toBeDefined();
      expect((await rejection(authorizer.authorize(TOKEN, opts({ resource: MCP })))).code).toBe('invalid_token');
    });

    it('a token bound to some other resource is refused on both surfaces', async () => {
      row = baseRow('https://evil.example/mcp');
      expect((await rejection(authorizer.authorize(TOKEN, opts()))).code).toBe('invalid_token');
      expect((await rejection(authorizer.authorize(TOKEN, opts({ resource: MCP })))).code).toBe('invalid_token');
    });

    it('matching resource passes', async () => {
      row = baseRow(MCP);
      const ctx = await authorizer.authorize(TOKEN, opts({ resource: MCP }));
      expect(ctx.accountId).toBe('acc-1');

      row = baseRow(null);
      expect((await authorizer.authorize(TOKEN, opts({ resource: null }))).accountId).toBe('acc-1');
    });

    it('selects the resource in the one token query', async () => {
      await authorizer.authorize(TOKEN, opts());
      const args = prisma.oAuthToken.findUnique.mock.calls[0][0] as any;
      expect(args.select.resource).toBe(true);
    });
  });

  describe('consumeRateLimit', () => {
    it('counts by default (REST behaviour unchanged)', async () => {
      await authorizer.authorize(TOKEN, opts());
      expect(rateLimit.check).toHaveBeenCalledTimes(1);
    });

    it('false skips the counter (even when the bucket is full) but still checks the token', async () => {
      rate = { limit: 120, remaining: 0, retryAfterSec: 9 };
      const ctx = await authorizer.authorize(TOKEN, opts({ requiredScopes: [], tokenOnly: true, connectionLevel: true, consumeRateLimit: false }));
      expect(rateLimit.check).not.toHaveBeenCalled();
      expect(ctx.rateLimit).toEqual({ limit: 0, remaining: 0 });
      row = null;
      const err = await rejection(authorizer.authorize(TOKEN, opts({ tokenOnly: true, connectionLevel: true, consumeRateLimit: false })));
      expect(err.code).toBe('invalid_token');
    });
  });

  it('returns the full context, rate-limit figures included', async () => {
    const ctx = await authorizer.authorize(TOKEN, opts());
    expect(ctx).toEqual({
      user: {
        id: 'user-1',
        email: 'u@example.com',
        name: 'U',
        currencyCode: 'PLN',
        timezone: 'Europe/Warsaw',
        defaultAccountId: 'acc-1',
      },
      oauth: {
        clientDbId: 'client-db-1',
        clientName: 'Claude',
        grantId: 'grant-1',
        scopes: ['expenses:read', 'categories:read'],
        grantAccountIds: ['acc-1'],
        encryptionTier: 0,
      },
      accountId: 'acc-1',
      accountRole: 'editor',
      monthAnchorDay: 10,
      rateLimit: { limit: 120, remaining: 119 },
    });
  });

  it('per-account checks run when connectionLevel is false and accountId is given', async () => {
    row!.grant.accounts = [grantAccount('acc-1'), grantAccount('acc-2', 0, 25)];
    roles['acc-2'] = 'viewer';
    expect((await rejection(authorizer.authorize(TOKEN, opts({ accountId: 'acc-2' })))).code).toBe('grant_inactive');
    expect(prisma.accountMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId_userId: { accountId: 'acc-2', userId: 'user-1' } } }),
    );

    roles['acc-2'] = 'owner';
    row!.grant.accounts[1].account.encryptionTier = 2;
    expect((await rejection(authorizer.authorize(TOKEN, opts({ accountId: 'acc-2' })))).code).toBe('account_encrypted');

    row!.grant.accounts[1].account.encryptionTier = 1;
    const ctx = await authorizer.authorize(TOKEN, opts({ accountId: 'acc-2' }));
    expect(ctx).toMatchObject({ accountId: 'acc-2', accountRole: 'owner', monthAnchorDay: 25 });
    expect(ctx.oauth.encryptionTier).toBe(1);

    expect((await rejection(authorizer.authorize(TOKEN, opts({ accountId: 'acc-9' })))).code).toBe('account_not_granted');
  });

  it('connectionLevel skips the per-account checks and addresses no account', async () => {
    row!.grant.accounts = [grantAccount('acc-1'), grantAccount('acc-2', 2)];
    roles['acc-1'] = 'viewer';
    const ctx = await authorizer.authorize(TOKEN, opts({ tokenOnly: true, requiredScopes: [], connectionLevel: true }));
    expect(ctx.accountId).toBeUndefined();
    expect(ctx.accountRole).toBeUndefined();
    expect(ctx.oauth.encryptionTier).toBe(0);
    expect(ctx.oauth.grantAccountIds).toEqual(['acc-1', 'acc-2']);
    expect(prisma.accountMember.findUnique).not.toHaveBeenCalled();
  });

  it('a missing accountId with two granted accounts is account_required', async () => {
    row!.grant.accounts = [grantAccount('acc-1'), grantAccount('acc-2')];
    const err = await rejection(authorizer.authorize(TOKEN, opts({ accountId: null })));
    expect(err.getStatus()).toBe(400);
    expect(err.code).toBe('account_required');
    expect(rateLimit.check).toHaveBeenCalledTimes(1);
  });

  it('429 carries retryAfterSec', async () => {
    rate = { limit: 120, remaining: 0, retryAfterSec: 37 };
    const err = (await rejection(authorizer.authorize(TOKEN, opts()))) as PublicApiError & {
      retryAfterSec?: number;
      rateLimit?: { limit: number; remaining: number };
    };
    expect(err.getStatus()).toBe(429);
    expect(err.code).toBe('rate_limited');
    expect(err.retryAfterSec).toBe(37);
    expect(err.rateLimit).toEqual({ limit: 120, remaining: 0 });
    await new Promise((r) => setImmediate(r));
    expect(cache.setIfAbsent).not.toHaveBeenCalled();
  });

  it('a refusal or failure after the rate limit carries the rate-limit figures; one before it does not', async () => {
    row!.grant.accounts = [grantAccount('acc-1'), grantAccount('acc-2')];
    const required = (await rejection(authorizer.authorize(TOKEN, opts()))) as PublicApiError;
    expect(required.rateLimit).toEqual({ limit: 120, remaining: 119 });

    prisma.accountMember.findUnique.mockRejectedValueOnce(new Error('db down'));
    const failure = (await authorizer.authorize(TOKEN, opts({ accountId: 'acc-1' })).catch((e) => e)) as Error & {
      rateLimit?: unknown;
    };
    expect(failure.message).toBe('db down');
    expect(failure.rateLimit).toEqual({ limit: 120, remaining: 119 });

    row!.grant.scopes = [];
    const scope = await rejection(authorizer.authorize(TOKEN, opts({ accountId: 'acc-1' })));
    expect(scope.code).toBe('insufficient_scope');
    expect(scope.rateLimit).toBeUndefined();
  });

  it('never returns a context for a revoked grant', async () => {
    row!.grant.revokedAt = new Date();
    const err = await rejection(authorizer.authorize(TOKEN, opts()));
    expect(err.code).toBe('invalid_token');
    expect((await rejection(authorizer.authorize(TOKEN, opts({ tokenOnly: true, requiredScopes: [], connectionLevel: true })))).code).toBe(
      'invalid_token',
    );
  });

  it('a missing or non-access bearer is invalid_token without a DB read', async () => {
    expect((await rejection(authorizer.authorize(null, opts()))).code).toBe('invalid_token');
    expect((await rejection(authorizer.authorize('aba_rt_x', opts()))).code).toBe('invalid_token');
    expect(prisma.oAuthToken.findUnique).not.toHaveBeenCalled();
  });

  it('empty requiredScopes without tokenOnly is insufficient_scope (deny by default)', async () => {
    expect((await rejection(authorizer.authorize(TOKEN, opts({ requiredScopes: [] })))).code).toBe('insufficient_scope');
  });

  it('stamps lastUsedAt fire-and-forget on success', async () => {
    await authorizer.authorize(TOKEN, opts());
    await new Promise((r) => setImmediate(r));
    expect(cache.setIfAbsent).toHaveBeenCalledWith('oauth:lu:grant-1', 300);
    expect(prisma.oAuthGrant.updateMany).toHaveBeenCalledWith({ where: { id: 'grant-1' }, data: { lastUsedAt: expect.any(Date) } });
  });

  it('never puts the token into an error', async () => {
    row = null;
    const err = await rejection(authorizer.authorize(TOKEN, opts()));
    expect(JSON.stringify({ body: err.getResponse(), message: err.message })).not.toContain(TOKEN);
  });

  describe('resolveAccountId', () => {
    it('defaults to the only granted account and matches trimmed, lower-cased', () => {
      expect(resolveAccountId(undefined, undefined, ['acc-1'])).toBe('acc-1');
      expect(resolveAccountId('  ACC-2 ', ['  ACC-2 '], ['acc-1', 'acc-2'])).toBe('acc-2');
    });

    it('refuses a repeated header', () => {
      expect(() => resolveAccountId('acc-1, acc-2', undefined, ['acc-1', 'acc-2'])).toThrow(PublicApiError);
      expect(() => resolveAccountId('acc-1', ['acc-1', 'acc-2'], ['acc-1', 'acc-2'])).toThrow(PublicApiError);
    });
  });
});
