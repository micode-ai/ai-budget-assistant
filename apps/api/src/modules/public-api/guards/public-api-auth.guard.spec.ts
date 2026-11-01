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
}

const TOKEN = 'aba_at_good-token';

function baseRow() {
  return {
    kind: 'access',
    expiresAt: new Date(Date.now() + 3_600_000),
    grant: {
      id: 'grant-1',
      userId: 'user-1',
      accountId: 'acc-1',
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
      account: { encryptionTier: 0, monthAnchorDay: 10, tripStatus: null as string | null },
    },
  };
}

describe('PublicApiAuthGuard (HTTP)', () => {
  let app: INestApplication;
  let enabled: string;
  let row: ReturnType<typeof baseRow> | null;
  let membership: { role: string } | null;
  let rate: { limit: number; remaining: number; retryAfterSec?: number } | Error;

  const prisma = {
    oAuthToken: { findUnique: jest.fn(async (_args?: unknown) => row) },
    accountMember: { findUnique: jest.fn(async (_args?: unknown) => membership) },
    oAuthGrant: { updateMany: jest.fn(async (_args?: unknown) => ({ count: 1 })) },
    account: { findUnique: jest.fn(async (_args?: unknown) => ({ tripStatus: row?.grant.account.tripStatus ?? null })) },
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
    membership = { role: 'editor' };
    rate = { limit: 120, remaining: 119 };
    jest.clearAllMocks();
  });

  const get = (path = '/public/v1/__test/read', token: string | null = TOKEN) => {
    const r = request(app.getHttpServer()).get(path);
    return token === null ? r : r.set('Authorization', `Bearer ${token}`);
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
      oauth: { clientDbId: 'client-db-1', clientName: 'AI Accounting', grantId: 'grant-1', scopes: ['expenses:read'], encryptionTier: 0 },
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
    membership = { role: 'viewer' };
    expectError(await get(), 403, 'grant_inactive');
  });

  it('403 grant_inactive when the grantor was removed from the account', async () => {
    membership = null;
    expectError(await get(), 403, 'grant_inactive');
  });

  it('accepts an owner grantor', async () => {
    membership = { role: 'owner' };
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.accountRole).toBe('owner');
  });

  it('403 account_encrypted for an encryptionTier >= 2 account', async () => {
    row!.grant.account.encryptionTier = 2;
    expectError(await get(), 403, 'account_encrypted');
    row!.grant.account.encryptionTier = 3;
    expectError(await get(), 403, 'account_encrypted');
    expect(rateLimit.check).not.toHaveBeenCalled();
  });

  it('allows reads on a tier 1 account and exposes the tier on req.oauth', async () => {
    row!.grant.account.encryptionTier = 1;
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
    membership = { role: 'viewer' };
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
      row!.grant.account.encryptionTier = 1;
      expectError(await post('/public/v1/__test/write'), 403, 'account_encrypted');
    });

    it('403 trip_archived on an archived trip account', async () => {
      row!.grant.account.tripStatus = 'archived';
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

  it('never echoes the token in an error body', async () => {
    row = null;
    const res = await get();
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
  });
});
