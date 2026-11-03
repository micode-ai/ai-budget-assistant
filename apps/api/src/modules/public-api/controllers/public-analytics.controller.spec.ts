import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { CacheService } from '../../../common/cache/cache.service';
import { PrismaService } from '../../../database/prisma.service';
import { GLOBAL_PREFIX_EXCLUDED_ROUTES } from '../../../global-prefix-exclusions';
import { PublicApiEnabledGuard } from '../../oauth/guards/public-api-enabled.guard';
import { PublicApiExceptionFilter } from '../filters/public-api-exception.filter';
import { PublicApiAuthGuard } from '../guards/public-api-auth.guard';
import { PublicAnalyticsService } from '../public-analytics.service';
import { PublicApiError } from '../public-api-error';
import { PublicApiRateLimitService } from '../public-api-rate-limit.service';
import { PublicAnalyticsController } from './public-analytics.controller';

/** HTTP wiring of the analytics routes: scope, query validation, grantor and tier hand-off. */

function tokenRow(scopes: string[], encryptionTier = 0) {
  return {
    kind: 'access',
    expiresAt: new Date(Date.now() + 3_600_000),
    grant: {
      id: 'grant-1',
      userId: 'user-1',
      scopes,
      revokedAt: null,
      client: {
        id: 'client-db-1',
        name: 'AI Accounting',
        status: 'active',
        deletedAt: null,
        rateLimitPerGrant: null,
        rateLimitPerClient: null,
      },
      user: {
        id: 'user-1',
        email: 'u@example.com',
        name: 'M',
        currencyCode: 'PLN',
        timezone: 'Europe/Warsaw',
        defaultAccountId: 'acc-1',
        isActive: true,
      },
      accounts: [{ accountId: 'acc-1', account: { encryptionTier, monthAnchorDay: null } }],
    },
  };
}

describe('public analytics routes (HTTP)', () => {
  let app: INestApplication;
  let token: ReturnType<typeof tokenRow>;

  const prisma = {
    oAuthToken: { findUnique: jest.fn(async () => token) },
    accountMember: { findUnique: jest.fn(async () => ({ role: 'owner' })) },
    oAuthGrant: { updateMany: jest.fn(async () => ({ count: 1 })) },
  };
  const analytics = {
    summary: jest.fn(async () => ({ currency: 'PLN' })),
    byCategory: jest.fn(async () => ({ currency: 'PLN', data: [] })),
    monthly: jest.fn(async () => ({ currency: 'PLN', data: [] })),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [PublicAnalyticsController],
      providers: [
        PublicApiAuthGuard,
        PublicApiEnabledGuard,
        PublicApiExceptionFilter,
        { provide: PrismaService, useValue: prisma },
        { provide: PublicAnalyticsService, useValue: analytics },
        { provide: CacheService, useValue: { setIfAbsent: jest.fn(async () => false) } },
        {
          provide: PublicApiRateLimitService,
          useValue: { check: jest.fn(async () => ({ limit: 120, remaining: 119 })) },
        },
        { provide: ConfigService, useValue: { get: () => 'true' } },
      ],
    }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: GLOBAL_PREFIX_EXCLUDED_ROUTES });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      })
    );
    await app.init();
  });
  afterAll(() => app.close());

  beforeEach(() => {
    token = tokenRow(['analytics:read']);
    jest.clearAllMocks();
  });

  const get = (path: string) =>
    request(app.getHttpServer())
      .get(`/public/v1/analytics/${path}`)
      .set('Authorization', 'Bearer aba_at_good-token');
  const RANGE = 'from=2026-10-01&to=2026-10-31';

  it('summary and monthly pass the account, the grantor, the query and the tier', async () => {
    token = tokenRow(['analytics:read'], 1);
    expect((await get(`summary?${RANGE}&currency=EUR`)).status).toBe(200);
    expect(analytics.summary).toHaveBeenCalledWith(
      'acc-1',
      'user-1',
      { from: '2026-10-01', to: '2026-10-31', currency: 'EUR' },
      1
    );
    expect((await get(`monthly?${RANGE}`)).status).toBe(200);
    expect(analytics.monthly).toHaveBeenCalledWith(
      'acc-1',
      'user-1',
      { from: '2026-10-01', to: '2026-10-31' },
      1
    );
  });

  it('by-category defaults type to expense', async () => {
    expect((await get(`by-category?${RANGE}`)).status).toBe(200);
    expect(analytics.byCategory).toHaveBeenCalledWith(
      'acc-1',
      'user-1',
      expect.objectContaining({ type: 'expense', currency: undefined }),
      0
    );
    await get(`by-category?${RANGE}&type=income`);
    expect(analytics.byCategory).toHaveBeenLastCalledWith(
      'acc-1',
      'user-1',
      expect.objectContaining({ type: 'income' }),
      0
    );
  });

  it.each([
    ['missing from', 'summary?to=2026-10-31', 'from'],
    ['missing to', 'monthly?from=2026-10-01', 'to'],
    ['an impossible date', 'summary?from=2026-02-30&to=2026-03-01', 'from'],
    ['a lower-case currency', `summary?${RANGE}&currency=eur`, 'currency'],
    ['an unknown type', `by-category?${RANGE}&type=transfer`, 'type'],
    ['an unknown parameter', `summary?${RANGE}&account=x`, 'account'],
  ])('%s is 400 validation_failed naming the field', async (_label, path, field) => {
    const res = await get(path);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
    expect(Object.keys(res.body.error.details.fields)).toContain(field);
    expect(analytics.summary).not.toHaveBeenCalled();
    expect(analytics.byCategory).not.toHaveBeenCalled();
    expect(analytics.monthly).not.toHaveBeenCalled();
  });

  it("a service range error reaches the caller as the service's 400", async () => {
    analytics.summary.mockRejectedValueOnce(
      new PublicApiError(400, 'validation_failed', 'The request is invalid.', {
        fields: { to: ['to must not be earlier than from'] },
      })
    );
    const res = await get('summary?from=2026-10-31&to=2026-10-01');
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'validation_failed',
      message: 'The request is invalid.',
      details: { fields: { to: ['to must not be earlier than from'] } },
    });
  });

  it('requires analytics:read', async () => {
    token = tokenRow(['expenses:read', 'incomes:read']);
    for (const path of [`summary?${RANGE}`, `by-category?${RANGE}`, `monthly?${RANGE}`]) {
      const res = await get(path);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('insufficient_scope');
    }
  });
});
