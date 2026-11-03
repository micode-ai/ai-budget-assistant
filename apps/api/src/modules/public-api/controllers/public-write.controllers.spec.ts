import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { json } from 'express';
import * as request from 'supertest';
import { CacheService } from '../../../common/cache/cache.service';
import { PrismaService } from '../../../database/prisma.service';
import { GLOBAL_PREFIX_EXCLUDED_ROUTES } from '../../../global-prefix-exclusions';
import { BudgetAlertService } from '../../budgets/budget-alert.service';
import { ExpensesService } from '../../expenses/expenses.service';
import { IncomesService } from '../../incomes/incomes.service';
import { SharedActivityService } from '../../notifications/shared-activity.service';
import { PublicApiEnabledGuard } from '../../oauth/guards/public-api-enabled.guard';
import { PublicApiExceptionFilter } from '../filters/public-api-exception.filter';
import { PublicApiAuthGuard } from '../guards/public-api-auth.guard';
import { PublicWriteGuard } from '../guards/public-write.guard';
import { PublicApiRateLimitService } from '../public-api-rate-limit.service';
import { PublicExpenseWriteAdapter } from '../public-expense-write.adapter';
import { PublicIncomeWriteAdapter } from '../public-income-write.adapter';
import { PublicExpensesController } from './public-expenses.controller';
import { PublicIncomesController } from './public-incomes.controller';

const TOKEN = 'aba_at_good-token';
const EXP_ID = '00000000-0000-4000-8000-000000000001';
const KEY = '7d1f0e2a-3b4c-4d5e-8f60-718293a4b5c6';

function tokenRow(scopes: string[], encryptionTier = 0) {
  return {
    kind: 'access',
    expiresAt: new Date(Date.now() + 3_600_000),
    grant: {
      id: 'grant-1',
      userId: 'user-1',
      scopes,
      revokedAt: null,
      client: { id: 'client-db-1', name: 'AI Accounting', status: 'active', deletedAt: null, rateLimitPerGrant: null, rateLimitPerClient: null },
      user: {
        id: 'user-1',
        email: 'u@example.com',
        name: 'Mikhail',
        currencyCode: 'PLN',
        timezone: 'Europe/Warsaw',
        defaultAccountId: 'acc-1',
        isActive: true,
      },
      accounts: [{ accountId: 'acc-1', account: { encryptionTier, monthAnchorDay: null } }],
    },
  };
}

function detailRow() {
  const D = (v: string) => new Prisma.Decimal(v);
  return {
    id: EXP_ID,
    userId: 'user-1',
    amount: D('12.5'),
    currencyCode: 'PLN',
    date: new Date('2026-10-31T00:00:00.000Z'),
    time: null,
    categoryId: null,
    description: 'Lunch',
    merchant: null,
    notes: null,
    locationLat: null,
    locationLng: null,
    locationName: null,
    discountAmount: null,
    depositAmount: null,
    isDebt: false,
    isDebtRepayment: false,
    isSplitReceivable: false,
    isRecurring: false,
    source: 'api',
    createdAt: new Date('2026-10-31T12:00:00.000Z'),
    updatedAt: new Date('2026-10-31T12:00:00.000Z'),
    user: { name: 'Mikhail' },
    createdByOAuthClient: { clientId: 'aba_ci_x', name: 'AI Accounting' },
    expenseTags: [],
    projectExpenses: [],
    categorySplits: [],
    items: [],
  };
}

describe('public expense write routes (HTTP)', () => {
  let app: INestApplication;
  let token: ReturnType<typeof tokenRow>;
  let role: string;
  let tripStatus: string | null;
  let detail: ReturnType<typeof detailRow> | null;
  let keyRows: any[];

  const prisma = {
    oAuthToken: { findUnique: jest.fn(async () => token) },
    accountMember: { findUnique: jest.fn(async () => ({ role })) },
    oAuthGrant: { updateMany: jest.fn(async () => ({ count: 1 })) },
    account: { findUnique: jest.fn(async () => ({ currencyCode: 'PLN', tripStatus })) },
    expense: {
      findMany: jest.fn(async (args: any) => (args.where?.OR ? keyRows : [])),
      findFirst: jest.fn(async () => detail),
    },
    category: { findFirst: jest.fn(async () => null) },
    tag: { findMany: jest.fn(async () => []) },
    project: { findFirst: jest.fn(async () => null) },
  };
  const expenses = {
    create: jest.fn(async () => ({ expense: { id: EXP_ID }, isNew: true })),
    update: jest.fn(async () => ({ id: EXP_ID, currencyCode: 'PLN' })),
    remove: jest.fn(async () => ({ success: true })),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [PublicExpensesController],
      providers: [
        PublicApiAuthGuard,
        PublicApiEnabledGuard,
        PublicApiExceptionFilter,
        PublicWriteGuard,
        PublicExpenseWriteAdapter,
        { provide: PrismaService, useValue: prisma },
        { provide: ExpensesService, useValue: expenses },
        { provide: BudgetAlertService, useValue: { checkBudgetsForAccount: jest.fn(async () => undefined) } },
        { provide: SharedActivityService, useValue: { notifyExpenseCreated: jest.fn(async () => undefined) } },
        { provide: CacheService, useValue: { setIfAbsent: jest.fn(async () => false) } },
        { provide: PublicApiRateLimitService, useValue: { check: jest.fn(async () => ({ limit: 120, remaining: 119 })) } },
        { provide: ConfigService, useValue: { get: () => 'true' } },
      ],
    }).compile();
    app = mod.createNestApplication({ bodyParser: false });
    app.use(json());
    app.setGlobalPrefix('api/v1', { exclude: GLOBAL_PREFIX_EXCLUDED_ROUTES });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
    );
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    token = tokenRow(['expenses:read', 'expenses:write']);
    role = 'owner';
    tripStatus = null;
    detail = detailRow();
    keyRows = [];
    jest.clearAllMocks();
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`);
  const post = (body: object, key: string | null = KEY) => {
    const r = auth(request(app.getHttpServer()).post('/public/v1/expenses'));
    return key === null ? r.send(body) : r.set('Idempotency-Key', key).send(body);
  };
  const body = { amount: '12.50', date: '2026-10-31', description: 'Lunch' };

  describe('POST /public/v1/expenses', () => {
    it('201 with the detail shape of the new expense', async () => {
      const res = await post(body);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: EXP_ID, amount: '12.50', source: 'api', items: [] });
      expect(res.body.created_by_app).toEqual({ id: 'aba_ci_x', name: 'AI Accounting' });
      expect(expenses.create).toHaveBeenCalledWith(
        'acc-1',
        'user-1',
        expect.objectContaining({ localId: KEY, amount: 12.5, source: 'api', currencyCode: 'PLN' }),
        { createdByOAuthClientId: 'client-db-1' },
      );
    });

    it('200 with the existing expense when the key was already used by this app; body ignored', async () => {
      keyRows = [{ id: EXP_ID, clientId: KEY, createdByOAuthClientId: 'client-db-1', isDeleted: false, isPlanned: false }];
      const res = await post({ ...body, amount: '99.99' });
      expect(res.status).toBe(200);
      expect(res.body.amount).toBe('12.50');
      expect(expenses.create).not.toHaveBeenCalled();
      expect(expenses.update).not.toHaveBeenCalled();
    });

    it('409 idempotency_key_conflict when the key belongs to an app-created expense', async () => {
      keyRows = [{ id: EXP_ID, clientId: KEY, createdByOAuthClientId: null, isDeleted: false, isPlanned: false }];
      const res = await post(body);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('idempotency_key_conflict');
      expect(JSON.stringify(res.body)).not.toContain('Lunch');
    });

    it.each([
      ['missing', null],
      ['not a UUID', 'abc'],
    ])('400 validation_failed when the Idempotency-Key is %s', async (_label, key) => {
      const res = await post(body, key);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_failed');
      expect(expenses.create).not.toHaveBeenCalled();
    });

    it('a tier 1 (encrypted) account is 403 account_encrypted', async () => {
      token = tokenRow(['expenses:write'], 1);
      const res = await post(body);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('account_encrypted');
      expect(expenses.create).not.toHaveBeenCalled();
    });

    it('needs expenses:write', async () => {
      token = tokenRow(['expenses:read']);
      const res = await post(body);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('insufficient_scope');
    });

    // A viewer grantor never gets past PublicApiAuthGuard (grant_inactive); ViewerBlockGuard is the backstop.
    it('an archived trip is trip_archived', async () => {
      tripStatus = 'archived';
      expect((await post(body)).body.error.code).toBe('trip_archived');
      expect(expenses.create).not.toHaveBeenCalled();
    });

    it('refuses non-writable fields (debt, recurring, split, payer, source)', async () => {
      const res = await post({ ...body, is_debt: true, isRecurring: true, splits: [], paid_by_user_id: 'x', source: 'manual' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_failed');
      expect(Object.keys(res.body.error.details.fields).sort()).toEqual(
        ['isRecurring', 'is_debt', 'paid_by_user_id', 'source', 'splits'].sort(),
      );
    });

    it.each([
      ['a JSON number', 12.5],
      ['zero', '0'],
      ['three decimals', '1.005'],
      ['negative', '-1.00'],
      ['over Decimal(12,2)', '12345678901.00'],
    ])('refuses an amount that is %s', async (_label, amount) => {
      const res = await post({ ...body, amount });
      expect(res.status).toBe(400);
      expect(res.body.error.details.fields).toHaveProperty('amount');
    });

    it('refuses a bad currency, date or time', async () => {
      const res = await post({ ...body, currency: 'pln', date: '2026-02-30', time: '25:00' });
      expect(res.status).toBe(400);
      expect(Object.keys(res.body.error.details.fields).sort()).toEqual(['currency', 'date', 'time']);
    });

    it('a foreign category is 422 validation_failed with details.fields.category_id', async () => {
      const res = await post({ ...body, category_id: '11111111-1111-4111-8111-111111111111' });
      expect(res.status).toBe(422);
      expect(res.body.error).toMatchObject({ code: 'validation_failed', details: { fields: { category_id: [expect.any(String)] } } });
      expect(expenses.create).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /public/v1/expenses/:id', () => {
    const patch = (b: object, id = EXP_ID) => auth(request(app.getHttpServer()).patch(`/public/v1/expenses/${id}`)).send(b);

    it('updates through the service with the server id and answers the detail shape', async () => {
      const res = await patch({ amount: '7.10', notes: null });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(EXP_ID);
      expect(expenses.update).toHaveBeenCalledWith('acc-1', EXP_ID, { amount: 7.1, notes: null });
    });

    it('refuses null for a field that cannot be cleared, and items', async () => {
      const res = await patch({ amount: null, items: [] });
      expect(res.status).toBe(400);
      expect(Object.keys(res.body.error.details.fields).sort()).toEqual(['amount', 'items']);
    });

    it('a shared-group share row refuses amount/currency/date with 422, accepts notes', async () => {
      detail = { ...detailRow(), source: 'group' };
      const refused = await patch({ amount: '1.00', notes: 'x' });
      expect(refused.status).toBe(422);
      expect(refused.body.error).toMatchObject({
        code: 'validation_failed',
        details: { fields: { amount: ['set by the shared group'] } },
      });
      expect(expenses.update).not.toHaveBeenCalled();

      const ok = await patch({ notes: 'x' });
      expect(ok.status).toBe(200);
      expect(expenses.update).toHaveBeenCalledWith('acc-1', EXP_ID, { notes: 'x' });
    });

    it('404 for an expense not in the account', async () => {
      detail = null;
      const res = await patch({ amount: '1.00' });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
      expect(expenses.update).not.toHaveBeenCalled();
    });

    it('a tier 1 account is account_encrypted', async () => {
      token = tokenRow(['expenses:write'], 1);
      expect((await patch({ amount: '1.00' })).body.error.code).toBe('account_encrypted');
    });
  });

  describe('DELETE /public/v1/expenses/:id', () => {
    const del = (id = EXP_ID) => auth(request(app.getHttpServer()).delete(`/public/v1/expenses/${id}`));

    it('204, soft delete through ExpensesService.remove', async () => {
      const res = await del();
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect(expenses.remove).toHaveBeenCalledWith('acc-1', EXP_ID);
    });

    it('a shared-group share row is deletable, as in the app', async () => {
      detail = { ...detailRow(), source: 'group' };
      expect((await del()).status).toBe(204);
      expect(expenses.remove).toHaveBeenCalledWith('acc-1', EXP_ID);
    });

    it('404 for an unknown id', async () => {
      detail = null;
      expect((await del()).status).toBe(404);
      expect(expenses.remove).not.toHaveBeenCalled();
    });
  });
});

const INC_ID = '00000000-0000-4000-8000-000000000002';

function incomeDetailRow(over: Record<string, unknown> = {}) {
  const D = (v: string) => new Prisma.Decimal(v);
  return {
    id: INC_ID,
    amount: D('4200'),
    currencyCode: 'PLN',
    date: new Date('2026-10-31T00:00:00.000Z'),
    description: 'Salary',
    notes: null,
    source: 'api',
    isDebt: false,
    isDebtRepayment: false,
    isSplitReceivable: false,
    createdAt: new Date('2026-10-31T12:00:00.000Z'),
    updatedAt: new Date('2026-10-31T12:00:00.000Z'),
    category: null,
    linkedTransfer: null,
    createdByOAuthClient: { clientId: 'aba_ci_x', name: 'AI Accounting' },
    incomeTags: [],
    projectIncomes: [],
    ...over,
  };
}

describe('public income write routes (HTTP)', () => {
  let app: INestApplication;
  let token: ReturnType<typeof tokenRow>;
  let tripStatus: string | null;
  let detail: ReturnType<typeof incomeDetailRow> | null;
  let keyRows: any[];
  let categoryOk: boolean;

  const prisma = {
    oAuthToken: { findUnique: jest.fn(async () => token) },
    accountMember: { findUnique: jest.fn(async () => ({ role: 'owner' })) },
    oAuthGrant: { updateMany: jest.fn(async () => ({ count: 1 })) },
    account: { findUnique: jest.fn(async () => ({ currencyCode: 'PLN', tripStatus })) },
    income: {
      findMany: jest.fn(async (args: any) => (args.where?.OR ? keyRows : [])),
      findFirst: jest.fn(async () => detail),
    },
    category: { findFirst: jest.fn(async () => (categoryOk ? { id: 'c' } : null)) },
    tag: { findMany: jest.fn(async () => []) },
    project: { findFirst: jest.fn(async () => null) },
  };
  const incomes = {
    createWithStatus: jest.fn(async () => ({ income: { id: INC_ID }, isNew: true })),
    update: jest.fn(async () => ({ id: INC_ID })),
    remove: jest.fn(async () => ({ success: true })),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [PublicIncomesController],
      providers: [
        PublicApiAuthGuard,
        PublicApiEnabledGuard,
        PublicApiExceptionFilter,
        PublicWriteGuard,
        PublicIncomeWriteAdapter,
        { provide: PrismaService, useValue: prisma },
        { provide: IncomesService, useValue: incomes },
        { provide: CacheService, useValue: { setIfAbsent: jest.fn(async () => false) } },
        { provide: PublicApiRateLimitService, useValue: { check: jest.fn(async () => ({ limit: 120, remaining: 119 })) } },
        { provide: ConfigService, useValue: { get: () => 'true' } },
      ],
    }).compile();
    app = mod.createNestApplication({ bodyParser: false });
    app.use(json());
    app.setGlobalPrefix('api/v1', { exclude: GLOBAL_PREFIX_EXCLUDED_ROUTES });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
    );
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    token = tokenRow(['incomes:read', 'incomes:write']);
    tripStatus = null;
    detail = incomeDetailRow();
    keyRows = [];
    categoryOk = true;
    jest.clearAllMocks();
  });

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`);
  const post = (b: object, key: string | null = KEY) => {
    const r = auth(request(app.getHttpServer()).post('/public/v1/incomes'));
    return key === null ? r.send(b) : r.set('Idempotency-Key', key).send(b);
  };
  const patch = (b: object, id = INC_ID) => auth(request(app.getHttpServer()).patch(`/public/v1/incomes/${id}`)).send(b);
  const del = (id = INC_ID) => auth(request(app.getHttpServer()).delete(`/public/v1/incomes/${id}`));
  const body = { amount: '4200.00', date: '2026-10-31', description: 'Salary' };

  describe('POST /public/v1/incomes', () => {
    it('201 with the detail shape and the app attribution', async () => {
      const res = await post(body);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: INC_ID, amount: '4200.00', source: 'api' });
      expect(res.body.created_by_app).toEqual({ id: 'aba_ci_x', name: 'AI Accounting' });
      expect(incomes.createWithStatus).toHaveBeenCalledWith(
        'acc-1',
        'user-1',
        expect.objectContaining({ localId: KEY, amount: 4200, source: 'api', currencyCode: 'PLN' }),
        { createdByOAuthClientId: 'client-db-1' },
      );
    });

    it('200 when the service reports the row as not new (racing repeat of the key)', async () => {
      incomes.createWithStatus.mockResolvedValueOnce({ income: { id: INC_ID }, isNew: false });
      expect((await post(body)).status).toBe(200);
    });

    it('200 and no service call when this app already created the income under the key', async () => {
      keyRows = [{ id: INC_ID, clientId: KEY, createdByOAuthClientId: 'client-db-1', isDeleted: false }];
      const res = await post({ ...body, amount: '1.00' });
      expect(res.status).toBe(200);
      expect(incomes.createWithStatus).not.toHaveBeenCalled();
    });

    it.each([
      ['another app', { id: INC_ID, clientId: KEY, createdByOAuthClientId: 'other', isDeleted: false }],
      ['an app-created income', { id: INC_ID, clientId: KEY, createdByOAuthClientId: null, isDeleted: false }],
      ['a deleted income', { id: INC_ID, clientId: KEY, createdByOAuthClientId: 'client-db-1', isDeleted: true }],
      ['another income server id', { id: KEY, clientId: 'x', createdByOAuthClientId: null, isDeleted: false }],
    ])('409 idempotency_key_conflict for a key owned by %s', async (_n, row) => {
      keyRows = [row];
      const res = await post(body);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('idempotency_key_conflict');
      expect(incomes.createWithStatus).not.toHaveBeenCalled();
    });

    it('an expense category id is 422 with details.fields.category_id', async () => {
      categoryOk = false;
      const res = await post({ ...body, category_id: '11111111-1111-4111-8111-111111111111' });
      expect(res.status).toBe(422);
      expect(res.body.error).toMatchObject({ code: 'validation_failed', details: { fields: { category_id: [expect.any(String)] } } });
      expect(incomes.createWithStatus).not.toHaveBeenCalled();
    });

    it('refuses debt fields and source (whitelist)', async () => {
      const res = await post({ ...body, is_debt: true, source: 'manual' });
      expect(res.status).toBe(400);
      expect(Object.keys(res.body.error.details.fields).sort()).toEqual(['is_debt', 'source']);
    });

    it('a tier 1 account is 403 account_encrypted; needs incomes:write', async () => {
      token = tokenRow(['incomes:write'], 1);
      const enc = await post(body);
      expect(enc.status).toBe(403);
      expect(enc.body.error.code).toBe('account_encrypted');
      token = tokenRow(['incomes:read']);
      expect((await post(body)).body.error.code).toBe('insufficient_scope');
      expect(incomes.createWithStatus).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /public/v1/incomes/:id', () => {
    it('updates through the service with the server id; null clears', async () => {
      const res = await patch({ amount: '5.00', notes: null });
      expect(res.status).toBe(200);
      expect(incomes.update).toHaveBeenCalledWith('acc-1', INC_ID, { amount: 5, notes: null });
    });

    it('a debt repayment takes an amount edit; is_debt is refused', async () => {
      detail = incomeDetailRow({ isDebtRepayment: true });
      expect((await patch({ amount: '5.00' })).status).toBe(200);
      expect(incomes.update).toHaveBeenCalledWith('acc-1', INC_ID, { amount: 5 });
      expect((await patch({ is_debt: false })).status).toBe(400);
    });

    it('a transfer-linked income is 422 validation_failed naming the transfer', async () => {
      detail = incomeDetailRow({ linkedTransfer: { id: 't-1' } });
      const res = await patch({ notes: 'x' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('validation_failed');
      expect(res.body.error.message).toMatch(/transfer/i);
      expect(incomes.update).not.toHaveBeenCalled();
    });

    it('404 for an income not in the account; tier 1 is account_encrypted', async () => {
      detail = null;
      expect((await patch({ amount: '1.00' })).status).toBe(404);
      token = tokenRow(['incomes:write'], 1);
      expect((await patch({ amount: '1.00' })).body.error.code).toBe('account_encrypted');
    });
  });

  describe('DELETE /public/v1/incomes/:id', () => {
    it('204, soft delete through IncomesService.remove', async () => {
      const res = await del();
      expect(res.status).toBe(204);
      expect(incomes.remove).toHaveBeenCalledWith('acc-1', INC_ID);
    });

    it('a transfer-linked income is 422 validation_failed', async () => {
      detail = incomeDetailRow({ linkedTransfer: { id: 't-1' } });
      const res = await del();
      expect(res.status).toBe(422);
      expect(res.body.error.message).toMatch(/transfer/i);
      expect(incomes.remove).not.toHaveBeenCalled();
    });

    it('404 for an unknown id; tier 1 is account_encrypted', async () => {
      detail = null;
      expect((await del()).status).toBe(404);
      token = tokenRow(['incomes:write'], 1);
      expect((await del()).body.error.code).toBe('account_encrypted');
    });
  });
});
