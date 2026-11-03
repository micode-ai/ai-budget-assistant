import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { json } from 'express';
import * as request from 'supertest';
import { CacheService } from '../../../common/cache/cache.service';
import { PrismaService } from '../../../database/prisma.service';
import { GLOBAL_PREFIX_EXCLUDED_ROUTES } from '../../../global-prefix-exclusions';
import { BudgetsService } from '../../budgets/budgets.service';
import { PublicApiEnabledGuard } from '../../oauth/guards/public-api-enabled.guard';
import { PublicApiExceptionFilter } from '../filters/public-api-exception.filter';
import { PublicApiAuthGuard } from '../guards/public-api-auth.guard';
import { PublicWriteGuard } from '../guards/public-write.guard';
import { PublicApiRateLimitService } from '../public-api-rate-limit.service';
import { PublicBudgetWriteAdapter } from '../public-budget-write.adapter';
import { PublicBudgetsController } from './public-budgets.controller';

const TOKEN = 'aba_at_good-token';
const B_ID = '00000000-0000-4000-8000-0000000000b1';
const KEY = '7d1f0e2a-3b4c-4d5e-8f60-718293a4b5c6';
const CAT = '11111111-1111-4111-8111-111111111111';
const D = (v: string) => new Prisma.Decimal(v);

function tokenRow(scopes: string[], encryptionTier = 0, monthAnchorDay: number | null = null) {
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
      accounts: [{ accountId: 'acc-1', account: { encryptionTier, monthAnchorDay } }],
    },
  };
}

function budgetRow(id = B_ID) {
  return {
    id,
    name: 'Groceries',
    amount: D('500'),
    currencyCode: 'PLN',
    period: 'monthly',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: null,
    alertThreshold: 80,
    isActive: true,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    categoryAllocations: [{ categoryId: CAT, amount: D('100'), category: { name: 'Food' } }],
  };
}

describe('public budget routes (HTTP)', () => {
  let app: INestApplication;
  let token: ReturnType<typeof tokenRow>;
  let found: { id: string } | null;
  let keyRows: any[];
  let categoryOk: boolean;

  const prisma = {
    oAuthToken: { findUnique: jest.fn(async () => token) },
    accountMember: { findUnique: jest.fn(async () => ({ role: 'owner' })) },
    oAuthGrant: { updateMany: jest.fn(async () => ({ count: 1 })) },
    account: { findUnique: jest.fn(async () => ({ currencyCode: 'PLN', tripStatus: null })) },
    budget: {
      findMany: jest.fn(async (args: any) => (args.where?.OR ? keyRows : [])),
      findFirst: jest.fn(async () => found),
    },
    category: { findFirst: jest.fn(async () => (categoryOk ? { id: CAT } : null)) },
  };
  const budgets = {
    findAll: jest.fn(async () => [budgetRow()]),
    getAccountAnchorDay: jest.fn(async () => 10),
    getProgress: jest.fn(async (_a: string, id: string) => ({
      budget: budgetRow(id),
      periodStart: new Date(2026, 10, 10),
      periodEnd: new Date(2026, 11, 9, 23, 59, 59, 999),
      spent: 123.456,
      remaining: 376.544,
      percentageUsed: 24.6912,
      projectedTotal: 400,
    })),
    createWithStatus: jest.fn(async () => ({ budget: { id: B_ID }, isNew: true })),
    update: jest.fn(async () => ({ id: B_ID })),
    remove: jest.fn(async () => ({ success: true })),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [PublicBudgetsController],
      providers: [
        PublicApiAuthGuard,
        PublicApiEnabledGuard,
        PublicApiExceptionFilter,
        PublicWriteGuard,
        PublicBudgetWriteAdapter,
        { provide: PrismaService, useValue: prisma },
        { provide: BudgetsService, useValue: budgets },
        { provide: CacheService, useValue: { setIfAbsent: jest.fn(async () => false) } },
        {
          provide: PublicApiRateLimitService,
          useValue: { check: jest.fn(async () => ({ limit: 120, remaining: 119 })) },
        },
        { provide: ConfigService, useValue: { get: () => 'true' } },
      ],
    }).compile();
    app = mod.createNestApplication({ bodyParser: false });
    app.use(json());
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
    token = tokenRow(['budgets:read', 'budgets:write']);
    found = { id: B_ID };
    keyRows = [];
    categoryOk = true;
    jest.clearAllMocks();
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`);
  const get = (path = '') => auth(request(app.getHttpServer()).get(`/public/v1/budgets${path}`));
  const post = (b: object, key: string | null = KEY) => {
    const r = auth(request(app.getHttpServer()).post('/public/v1/budgets'));
    return key === null ? r.send(b) : r.set('Idempotency-Key', key).send(b);
  };
  const patch = (b: object, id = B_ID) =>
    auth(request(app.getHttpServer()).patch(`/public/v1/budgets/${id}`)).send(b);
  const del = (id = B_ID) => auth(request(app.getHttpServer()).delete(`/public/v1/budgets/${id}`));
  const body = { name: 'Groceries', amount: '500.00', period: 'monthly', start_date: '2026-11-01' };

  describe('reads', () => {
    it('GET / lists budgets with progress computed from the account anchor day', async () => {
      const res = await get();
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        id: B_ID,
        name: 'Groceries',
        amount: '500.00',
        currency: 'PLN',
        allocations: [{ category_id: CAT, category_name: 'Food', amount: '100.00' }],
        progress: {
          period_start: '2026-11-10',
          period_end: '2026-12-09',
          spent: '123.46',
          remaining: '376.54',
          percent_used: 24.7,
          projected_total: '400.00',
        },
        encrypted_fields: [],
      });
      expect(budgets.getAccountAnchorDay).toHaveBeenCalledWith('acc-1');
      expect(budgets.getProgress).toHaveBeenCalledWith('acc-1', B_ID, 10);
    });

    it('GET /:id is the same shape; 404 for a deleted or foreign budget', async () => {
      expect((await get(`/${B_ID}`)).body.progress.percent_used).toBe(24.7);
      found = null;
      const res = await get(`/${B_ID}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    });

    it('tier 1 nulls the name and allocation names and lists them', async () => {
      token = tokenRow(['budgets:read'], 1);
      const res = await get(`/${B_ID}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBeNull();
      expect(res.body.allocations[0].category_name).toBeNull();
      expect(res.body.encrypted_fields).toEqual(['name', 'allocations.category_name']);
    });

    it('needs budgets:read', async () => {
      token = tokenRow(['budgets:write']);
      expect((await get()).body.error.code).toBe('insufficient_scope');
    });
  });

  describe('POST', () => {
    it('201 with the detail shape; the app attribution goes to the service', async () => {
      const res = await post(body);
      expect(res.status).toBe(201);
      expect(res.body.id).toBe(B_ID);
      expect(budgets.createWithStatus).toHaveBeenCalledWith(
        'acc-1',
        'user-1',
        expect.objectContaining({
          localId: KEY,
          amount: 500,
          currencyCode: 'PLN',
          period: 'monthly',
        }),
        { createdByOAuthClientId: 'client-db-1' }
      );
    });

    it('200 on a racing repeat and on an own repeat (no service call)', async () => {
      budgets.createWithStatus.mockResolvedValueOnce({ budget: { id: B_ID }, isNew: false });
      expect((await post(body)).status).toBe(200);
      keyRows = [
        { id: B_ID, clientId: KEY, createdByOAuthClientId: 'client-db-1', isDeleted: false },
      ];
      expect((await post(body)).status).toBe(200);
      expect(budgets.createWithStatus).toHaveBeenCalledTimes(1);
    });

    it.each([
      [
        'another app',
        { id: B_ID, clientId: KEY, createdByOAuthClientId: 'other', isDeleted: false },
      ],
      [
        'a deleted budget',
        { id: B_ID, clientId: KEY, createdByOAuthClientId: 'client-db-1', isDeleted: true },
      ],
    ])('409 for a key owned by %s', async (_n, row) => {
      keyRows = [row];
      const res = await post(body);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('idempotency_key_conflict');
    });

    it('a period outside the enum is 400 validation_failed (class-validator)', async () => {
      const res = await post({ ...body, period: 'hourly' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_failed');
      expect(res.body.error.details.fields.period).toBeDefined();
      expect(budgets.createWithStatus).not.toHaveBeenCalled();
    });

    it('refuses unknown fields and an alert_threshold outside 1-100', async () => {
      expect((await post({ ...body, source: 'x' })).status).toBe(400);
      expect((await post({ ...body, alert_threshold: 0 })).status).toBe(400);
      expect((await post({ ...body, alert_threshold: 101 })).status).toBe(400);
    });

    it('an allocation with a foreign or income category is 422 on allocations[0].category_id', async () => {
      categoryOk = false;
      const res = await post({ ...body, allocations: [{ category_id: CAT, amount: '10.00' }] });
      expect(res.status).toBe(422);
      expect(res.body.error.details.fields['allocations[0].category_id']).toBeDefined();
      expect(budgets.createWithStatus).not.toHaveBeenCalled();
    });

    it('a repeated allocation category is 422 on allocations[1].category_id for POST and PATCH', async () => {
      const allocations = [
        { category_id: CAT, amount: '10.00' },
        { category_id: CAT, amount: '20.00' },
      ];
      for (const res of [await post({ ...body, allocations }), await patch({ allocations })]) {
        expect(res.status).toBe(422);
        expect(res.body.error.details.fields['allocations[1].category_id']).toEqual([
          'duplicate category_id',
        ]);
      }
      expect(budgets.createWithStatus).not.toHaveBeenCalled();
      expect(budgets.update).not.toHaveBeenCalled();
    });

    it('tier 1 is 403 account_encrypted; needs budgets:write', async () => {
      token = tokenRow(['budgets:write'], 1);
      expect((await post(body)).body.error.code).toBe('account_encrypted');
      token = tokenRow(['budgets:read']);
      expect((await post(body)).body.error.code).toBe('insufficient_scope');
    });
  });

  describe('PATCH / DELETE', () => {
    it('PATCH updates by server id; allocations [] clears them', async () => {
      const res = await patch({ amount: '5.00', allocations: [] });
      expect(res.status).toBe(200);
      expect(budgets.update).toHaveBeenCalledWith('acc-1', B_ID, { amount: 5, categories: [] });
    });

    it('PATCH without allocations does not touch them', async () => {
      await patch({ name: 'x' });
      expect(budgets.update).toHaveBeenCalledWith('acc-1', B_ID, { name: 'x' });
    });

    it('PATCH and DELETE of a deleted budget are 404', async () => {
      found = null;
      expect((await patch({ name: 'x' })).status).toBe(404);
      expect((await del()).status).toBe(404);
      expect(budgets.update).not.toHaveBeenCalled();
      expect(budgets.remove).not.toHaveBeenCalled();
    });

    it('DELETE is 204 through BudgetsService.remove', async () => {
      expect((await del()).status).toBe(204);
      expect(budgets.remove).toHaveBeenCalledWith('acc-1', B_ID);
    });
  });
});
