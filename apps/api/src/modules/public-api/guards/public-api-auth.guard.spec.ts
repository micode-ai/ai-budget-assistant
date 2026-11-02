import { Body, Controller, Get, INestApplication, Post, Req, UseFilters, UseGuards, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { IsNumber } from 'class-validator';
import { json } from 'express';
import * as request from 'supertest';
import { GLOBAL_PREFIX_EXCLUDED_ROUTES } from '../../../global-prefix-exclusions';
import { CacheService } from '../../../common/cache/cache.service';
import { PrismaService } from '../../../database/prisma.service';
import { sha256Hex } from '../../oauth/oauth-crypto.util';
import { RequireScopes } from '../decorators/require-scopes.decorator';
import { TokenOnly } from '../decorators/token-only.decorator';
import { ConnectionLevel } from '../decorators/connection-level.decorator';
import { PublicWrite } from '../decorators/public-write.decorator';
import { PublicApiExceptionFilter } from '../filters/public-api-exception.filter';
import { PublicApiError } from '../public-api-error';
import { PublicApiRateLimitService } from '../public-api-rate-limit.service';
import { PublicApiAuthGuard } from './public-api-auth.guard';

class EchoDto {
  @IsNumber()
  amount!: number;
}

/** Test-only controller: the guard + filter exactly as the expense controllers will compose them. */
@Controller('public/v1/__test')
@UseGuards(PublicApiAuthGuard)
@UseFilters(PublicApiExceptionFilter)
class GuardTestController {
  @Get('read')
  @RequireScopes('expenses:read')
  read(@Req() req: any) {
    return {
      user: req.user,
      accountId: req.accountId,
      accountRole: req.accountRole,
      monthAnchorDay: req.monthAnchorDay,
      oauth: req.oauth,
    };
  }

  @Post('write')
  @RequireScopes('expenses:write')
  @PublicWrite()
  write() {
    return { ok: true };
  }

  @Post('echo')
  @RequireScopes('expenses:read')
  echo(@Body() dto: EchoDto) {
    return dto;
  }

  @Get('open')
  open() {
    return { ok: true };
  }

  @Get('empty-scopes')
  @RequireScopes()
  emptyScopes() {
    return { ok: true };
  }

  @Get('token-only')
  @TokenOnly()
  tokenOnly() {
    return { ok: true };
  }

  @Get('connection')
  @TokenOnly()
  @ConnectionLevel()
  connection(@Req() req: any) {
    return { accountId: req.accountId ?? null, accountRole: req.accountRole ?? null, oauth: req.oauth };
  }
}

const TOKEN = 'aba_at_good-token';

function baseRow() {
  return {
    kind: 'access',
    expiresAt: new Date(Date.now() + 3_600_000),
    grant: {
      id: 'grant-1',
      userId: 'user-1',
      scopes: ['expenses:read'],
      revokedAt: null as Date | null,
      client: {
        id: 'client-db-1',
        name: 'AI Accounting',
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
        defaultAccountId: 'acc-other',
        isActive: true,
      },
      accounts: [grantAccount('acc-1', 10)],
    },
  };
}

function grantAccount(accountId: string, monthAnchorDay: number | null = null) {
  return { accountId, account: { encryptionTier: 0, monthAnchorDay } };
}

describe('PublicApiAuthGuard (HTTP)', () => {
  let app: INestApplication;
  let enabled: string;
  let row: ReturnType<typeof baseRow> | null;
  /** The grantor's CURRENT role per account; null = not a member. */
  let roles: Record<string, string | null>;
  let tripStatus: Record<string, string | null>;
  let rate: { limit: number; remaining: number; retryAfterSec?: number } | Error;

  const prisma = {
    oAuthToken: { findUnique: jest.fn(async (_args?: unknown) => row) },
    accountMember: {
      findUnique: jest.fn(async (args: any) => {
        const role = roles[args.where.accountId_userId.accountId];
        return role ? { role } : null;
      }),
    },
    oAuthGrant: { updateMany: jest.fn(async (_args?: unknown) => ({ count: 1 })) },
    account: { findUnique: jest.fn(async (args: any) => ({ tripStatus: tripStatus[args.where.id] ?? null })) },
  };
  const cache = { setIfAbsent: jest.fn(async (_k?: string, _t?: number) => true) };
  const rateLimit = {
    check: jest.fn(async (_g?: string, _c?: string, _o?: unknown) => {
      if (rate instanceof Error) throw rate;
      return rate;
    }),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [GuardTestController],
      providers: [
        PublicApiAuthGuard,
        PublicApiExceptionFilter,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
        { provide: PublicApiRateLimitService, useValue: rateLimit },
        { provide: ConfigService, useValue: { get: () => enabled } },
      ],
    }).compile();
    app = mod.createNestApplication({ bodyParser: false });
    app.use(json());
    app.setGlobalPrefix('api/v1', { exclude: GLOBAL_PREFIX_EXCLUDED_ROUTES });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    enabled = 'true';
    row = baseRow();
    roles = { 'acc-1': 'editor', 'acc-2': 'editor' };
    tripStatus = {};
    rate = { limit: 120, remaining: 119 };
    jest.clearAllMocks();
  });

  const get = (path = '/public/v1/__test/read', token: string | null = TOKEN) => {
    const r = request(app.getHttpServer()).get(path);
    return token === null ? r : r.set('Authorization', `Bearer ${token}`);
  };
  /** A read addressed to one account through the X-Account-Id header (an array sends it twice). */
  const getAs = (accountId: string | string[], path = '/public/v1/__test/read') =>
    get(path).set('X-Account-Id', accountId as string);
  const tier = (i: number, value: number) => {
    row!.grant.accounts[i].account.encryptionTier = value;
  };
  const post = (path: string, body: object = {}) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${TOKEN}`).send(body);

  const expectError = (res: request.Response, status: number, code: string) => {
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
    expect(typeof res.body.error.message).toBe('string');
  };

  it('sets req.user / accountId / accountRole / monthAnchorDay / oauth like JwtStrategy + AccountContextGuard', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: {
        id: 'user-1',
        email: 'u@example.com',
        name: 'U',
        currencyCode: 'PLN',
        timezone: 'Europe/Warsaw',
        defaultAccountId: 'acc-other',
      },
      accountId: 'acc-1',
      accountRole: 'editor',
      monthAnchorDay: 10,
      oauth: {
        clientDbId: 'client-db-1',
        clientName: 'AI Accounting',
        grantId: 'grant-1',
        scopes: ['expenses:read'],
        encryptionTier: 0,
        grantAccountIds: ['acc-1'],
      },
    });
    expect(prisma.oAuthToken.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: sha256Hex(TOKEN) } }));
    expect(prisma.accountMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId_userId: { accountId: 'acc-1', userId: 'user-1' } } }),
    );
  });

  it('sets rate-limit headers on success', async () => {
    rate = { limit: 600, remaining: 412 };
    const res = await get();
    expect(res.headers['x-ratelimit-limit']).toBe('600');
    expect(res.headers['x-ratelimit-remaining']).toBe('412');
    expect(res.headers['retry-after']).toBeUndefined();
    expect(rateLimit.check).toHaveBeenCalledWith('grant-1', 'client-db-1', { perGrant: null, perClient: null });
  });

  it('passes the client row overrides to the rate limiter', async () => {
    row!.grant.client.rateLimitPerGrant = 600;
    row!.grant.client.rateLimitPerClient = 10_000;
    await get();
    expect(rateLimit.check).toHaveBeenCalledWith('grant-1', 'client-db-1', { perGrant: 600, perClient: 10_000 });
  });

  it('404s (not_found) while the feature flag is off, before touching the DB', async () => {
    enabled = 'false';
    expectError(await get(), 404, 'not_found');
    expect(prisma.oAuthToken.findUnique).not.toHaveBeenCalled();
  });

  it('401 invalid_token without a bearer token, or with a non-bearer scheme', async () => {
    const res = await get(undefined, null);
    expectError(res, 401, 'invalid_token');
    expect(res.headers['www-authenticate']).toMatch(/^Bearer/);
    const basic = await request(app.getHttpServer()).get('/public/v1/__test/read').set('Authorization', 'Basic YTpi');
    expectError(basic, 401, 'invalid_token');
    expect(prisma.oAuthToken.findUnique).not.toHaveBeenCalled();
  });

  it('401 invalid_token for an unknown token, a refresh token row, or an expired token', async () => {
    row = null;
    expectError(await get(), 401, 'invalid_token');

    row = baseRow();
    row.kind = 'refresh';
    expectError(await get(), 401, 'invalid_token');

    row = baseRow();
    row.expiresAt = new Date(Date.now() - 1000);
    expectError(await get(), 401, 'invalid_token');
  });

  it('401 invalid_token for a token without the access prefix (no DB lookup)', async () => {
    expectError(await get(undefined, 'aba_rt_refresh-token'), 401, 'invalid_token');
    expect(prisma.oAuthToken.findUnique).not.toHaveBeenCalled();
  });

  it('401 invalid_token when the token row still exists but its grant was revoked - checked on every request', async () => {
    expect((await get()).status).toBe(200);
    row!.grant.revokedAt = new Date();
    expectError(await get(), 401, 'invalid_token');
    expect(prisma.oAuthToken.findUnique).toHaveBeenCalledTimes(2);
  });

  it('401 invalid_token when the client is blocked or deleted', async () => {
    row!.grant.client.status = 'blocked';
    expectError(await get(), 401, 'invalid_token');
    row = baseRow();
    row.grant.client.deletedAt = new Date();
    expectError(await get(), 401, 'invalid_token');
  });

  it('401 invalid_token when the grantor user is deactivated', async () => {
    row!.grant.user.isActive = false;
    expectError(await get(), 401, 'invalid_token');
  });

  it('403 grant_inactive when the grantor was demoted to viewer after consent', async () => {
    roles['acc-1'] = 'viewer';
    expectError(await get(), 403, 'grant_inactive');
  });

  it('403 grant_inactive when the grantor was removed from the account', async () => {
    roles['acc-1'] = null;
    expectError(await get(), 403, 'grant_inactive');
  });

  it('accepts an owner grantor', async () => {
    roles['acc-1'] = 'owner';
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.accountRole).toBe('owner');
  });

  it('403 account_encrypted for an encryptionTier >= 2 account', async () => {
    tier(0, 2);
    expectError(await get(), 403, 'account_encrypted');
    tier(0, 3);
    expectError(await get(), 403, 'account_encrypted');
    // Account-level checks now run after the per-connection rate limit; a refusal stamps nothing.
    await new Promise((r) => setImmediate(r));
    expect(cache.setIfAbsent).not.toHaveBeenCalled();
  });

  it('allows reads on a tier 1 account and exposes the tier on req.oauth', async () => {
    tier(0, 1);
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.oauth.encryptionTier).toBe(1);
  });

  it("403 insufficient_scope with details.required, judged on the grant's CURRENT scopes", async () => {
    const res = await post('/public/v1/__test/write');
    expectError(res, 403, 'insufficient_scope');
    expect(res.body.error.details).toEqual({ required: ['expenses:write'] });
    expect(rateLimit.check).not.toHaveBeenCalled();
  });

  it('refuses a route with no @RequireScopes (deny by default) - 403 insufficient_scope', async () => {
    row!.grant.scopes = ['expenses:read', 'expenses:write', 'receipts:read', 'categories:read'];
    expectError(await get('/public/v1/__test/open'), 403, 'insufficient_scope');
    expect(rateLimit.check).not.toHaveBeenCalled();
  });

  it('refuses a route whose @RequireScopes() list is empty', async () => {
    expectError(await get('/public/v1/__test/empty-scopes'), 403, 'insufficient_scope');
  });

  it('@TokenOnly() routes need only a valid token, still behind every other check', async () => {
    row!.grant.scopes = [];
    const ok = await get('/public/v1/__test/token-only');
    expect(ok.status).toBe(200);
    expect(ok.headers['x-ratelimit-limit']).toBe('120');

    row!.grant.revokedAt = new Date();
    expectError(await get('/public/v1/__test/token-only'), 401, 'invalid_token');
    row!.grant.revokedAt = null;
    roles['acc-1'] = 'viewer';
    expectError(await get('/public/v1/__test/token-only'), 403, 'grant_inactive');
  });

  it('429 rate_limited with Retry-After and the limit headers', async () => {
    rate = { limit: 120, remaining: 0, retryAfterSec: 37 };
    const res = await get();
    expectError(res, 429, 'rate_limited');
    expect(res.headers['retry-after']).toBe('37');
    expect(res.headers['x-ratelimit-limit']).toBe('120');
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
    expect(cache.setIfAbsent).not.toHaveBeenCalled();
  });

  it('503 unavailable when the rate limiter fails closed', async () => {
    rate = new PublicApiError(503, 'unavailable', 'Temporarily unavailable');
    expectError(await get(), 503, 'unavailable');
  });

  it('stamps lastUsedAt only when the 5-minute throttle key is fresh', async () => {
    await get();
    await new Promise((r) => setImmediate(r));
    expect(cache.setIfAbsent).toHaveBeenCalledWith('oauth:lu:grant-1', 300);
    expect(prisma.oAuthGrant.updateMany).toHaveBeenCalledWith({ where: { id: 'grant-1' }, data: { lastUsedAt: expect.any(Date) } });

    jest.clearAllMocks();
    cache.setIfAbsent.mockResolvedValueOnce(false);
    await get();
    await new Promise((r) => setImmediate(r));
    expect(prisma.oAuthGrant.updateMany).not.toHaveBeenCalled();
  });

  it('a failed lastUsedAt stamp never fails the request', async () => {
    prisma.oAuthGrant.updateMany.mockRejectedValueOnce(new Error('db down'));
    expect((await get()).status).toBe(200);
  });

  describe('@PublicWrite()', () => {
    beforeEach(() => {
      row!.grant.scopes = ['expenses:read', 'expenses:write'];
    });

    it('passes on a plain account', async () => {
      const res = await post('/public/v1/__test/write');
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ ok: true });
    });

    it('403 account_encrypted on a tier 1 account', async () => {
      tier(0, 1);
      expectError(await post('/public/v1/__test/write'), 403, 'account_encrypted');
    });

    it('403 trip_archived on an archived trip account', async () => {
      tripStatus['acc-1'] = 'archived';
      expectError(await post('/public/v1/__test/write'), 403, 'trip_archived');
    });
  });

  it('turns a class-validator failure into validation_failed with details.fields', async () => {
    const res = await post('/public/v1/__test/echo', { amount: 'x', extra: 1 });
    expectError(res, 400, 'validation_failed');
    expect(res.body.error.details.fields).toEqual({
      amount: ['amount must be a number conforming to the specified constraints'],
      extra: ['property extra should not exist'],
    });
  });

  describe('account addressing, grant [A, B]', () => {
    beforeEach(() => {
      row!.grant.accounts = [grantAccount('acc-1', 10), grantAccount('acc-2', 25)];
    });

    it('400 account_required without the header, after the rate limit, with no lastUsedAt stamp', async () => {
      const res = await get();
      expectError(res, 400, 'account_required');
      expect(res.body.error.message).toBe(
        'This connection covers several accounts. Send the X-Account-Id header with one of the ids from GET /public/v1/accounts.',
      );
      expect(rateLimit.check).toHaveBeenCalledTimes(1);
      expect(prisma.accountMember.findUnique).not.toHaveBeenCalled();
      await new Promise((r) => setImmediate(r));
      expect(cache.setIfAbsent).not.toHaveBeenCalled();
    });

    it('an empty or blank header counts as absent: account_required', async () => {
      expectError(await getAs(''), 400, 'account_required');
      expectError(await getAs('   '), 400, 'account_required');
    });

    it("addresses B with X-Account-Id: B, with B's role and month anchor", async () => {
      roles['acc-2'] = 'owner';
      const res = await getAs('acc-2');
      expect(res.status).toBe(200);
      expect(res.body.accountId).toBe('acc-2');
      expect(res.body.accountRole).toBe('owner');
      expect(res.body.monthAnchorDay).toBe(25);
      expect(res.body.oauth.grantAccountIds).toEqual(['acc-1', 'acc-2']);
      expect(prisma.accountMember.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { accountId_userId: { accountId: 'acc-2', userId: 'user-1' } } }),
      );
    });

    it('compares the header trimmed and lower-cased (Review Focus 1)', async () => {
      const res = await getAs('  ACC-2 ');
      expect(res.status).toBe(200);
      expect(res.body.accountId).toBe('acc-2');
    });

    it('a header sent twice is 400 validation_failed on X-Account-Id', async () => {
      const res = await getAs(['acc-1', 'acc-2']);
      expectError(res, 400, 'validation_failed');
      expect(Object.keys(res.body.error.details.fields)).toEqual(['X-Account-Id']);
      expect(prisma.accountMember.findUnique).not.toHaveBeenCalled();
    });

    it('an id outside the connection is 403 account_not_granted - the same answer for one that does not exist', async () => {
      roles['acc-9'] = 'owner'; // the grantor's own account, just not in this connection
      const outside = await getAs('acc-9');
      expectError(outside, 403, 'account_not_granted');
      const unknown = await getAs('00000000-0000-4000-8000-000000000000');
      expectError(unknown, 403, 'account_not_granted');
      expect(unknown.body).toEqual(outside.body);
      expect(prisma.accountMember.findUnique).not.toHaveBeenCalled();
    });

    it('grantor demoted to viewer in B: B is grant_inactive, A still passes', async () => {
      roles['acc-2'] = 'viewer';
      expectError(await getAs('acc-2'), 403, 'grant_inactive');
      const a = await getAs('acc-1');
      expect(a.status).toBe(200);
      expect(a.body.accountId).toBe('acc-1');
    });

    it('B reached tier 2: B is account_encrypted, A still passes', async () => {
      tier(1, 2);
      expectError(await getAs('acc-2'), 403, 'account_encrypted');
      expect((await getAs('acc-1')).status).toBe(200);
    });

    it("exposes the ADDRESSED account's tier on req.oauth", async () => {
      tier(1, 1);
      expect((await getAs('acc-2')).body.oauth.encryptionTier).toBe(1);
      expect((await getAs('acc-1')).body.oauth.encryptionTier).toBe(0);
    });

    it('one rate-limit bucket for the connection, whichever account is addressed', async () => {
      await getAs('acc-1');
      await getAs('acc-2');
      expect(rateLimit.check).toHaveBeenCalledTimes(2);
      expect(rateLimit.check.mock.calls.map((c) => c[0])).toEqual(['grant-1', 'grant-1']);
    });

    it('@ConnectionLevel() passes without a header, sets no account and lists the granted ids', async () => {
      roles['acc-1'] = 'viewer';
      tier(1, 2);
      const res = await get('/public/v1/__test/connection');
      expect(res.status).toBe(200);
      expect(res.body.accountId).toBeNull();
      expect(res.body.accountRole).toBeNull();
      expect(res.body.oauth).toEqual({
        clientDbId: 'client-db-1',
        clientName: 'AI Accounting',
        grantId: 'grant-1',
        scopes: ['expenses:read'],
        encryptionTier: 0,
        grantAccountIds: ['acc-1', 'acc-2'],
      });
      expect(prisma.accountMember.findUnique).not.toHaveBeenCalled();
    });

    it('@ConnectionLevel() still refuses a revoked grant', async () => {
      row!.grant.revokedAt = new Date();
      expectError(await get('/public/v1/__test/connection'), 401, 'invalid_token');
    });
  });

  describe('account addressing, grant [A]', () => {
    it('no header addresses A (phase 1)', async () => {
      expect((await get()).body.accountId).toBe('acc-1');
    });

    it('X-Account-Id: A addresses A', async () => {
      expect((await getAs('acc-1')).body.accountId).toBe('acc-1');
    });

    it('X-Account-Id: B is account_not_granted', async () => {
      expectError(await getAs('acc-2'), 403, 'account_not_granted');
    });
  });

  it('401 invalid_token for a grant with no live account left, before the scope check', async () => {
    row!.grant.accounts = [];
    expectError(await get(), 401, 'invalid_token');
    expectError(await get('/public/v1/__test/connection'), 401, 'invalid_token');
    expect(rateLimit.check).not.toHaveBeenCalled();
  });

  it('selects only live accounts of the grant in the one token query', async () => {
    await get();
    const args = prisma.oAuthToken.findUnique.mock.calls[0][0] as any;
    expect(args.select.grant.select.accounts).toEqual({
      where: { account: { isActive: true } },
      orderBy: [{ createdAt: 'asc' }, { accountId: 'asc' }],
      select: { accountId: true, account: { select: { encryptionTier: true, monthAnchorDay: true } } },
    });
  });

  it('never echoes the token in an error body', async () => {
    row = null;
    const res = await get();
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
  });
});
