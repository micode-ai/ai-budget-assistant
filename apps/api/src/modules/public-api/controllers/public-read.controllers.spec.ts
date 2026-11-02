import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { json } from 'express';
import * as request from 'supertest';
import { CacheService } from '../../../common/cache/cache.service';
import { PrismaService } from '../../../database/prisma.service';
import { GLOBAL_PREFIX_EXCLUDED_ROUTES } from '../../../global-prefix-exclusions';
import { PublicApiEnabledGuard } from '../../oauth/guards/public-api-enabled.guard';
import { PublicApiExceptionFilter } from '../filters/public-api-exception.filter';
import { PublicApiAuthGuard } from '../guards/public-api-auth.guard';
import { PublicApiRateLimitService } from '../public-api-rate-limit.service';
import { PublicExpenseWriteAdapter } from '../public-expense-write.adapter';
import { PublicAccountController } from './public-account.controller';
import { PublicAccountsController } from './public-accounts.controller';
import { PublicCategoriesController } from './public-categories.controller';
import { PublicExpensesController } from './public-expenses.controller';

const TOKEN = 'aba_at_good-token';
const EXP_ID = '00000000-0000-4000-8000-000000000001';

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

function expenseRow() {
  const D = (v: string) => new Prisma.Decimal(v);
  return {
    id: EXP_ID,
    userId: 'user-1',
    amount: D('12.5'),
    currencyCode: 'PLN',
    date: new Date('2026-10-31T00:00:00.000Z'),
    time: null,
    categoryId: null,
    description: 'Groceries',
    merchant: 'Biedronka',
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
    source: 'manual',
    createdAt: new Date('2026-10-31T12:00:00.000Z'),
    updatedAt: new Date('2026-10-31T12:00:00.000Z'),
    user: { name: 'Mikhail' },
    createdByOAuthClient: null,
    expenseTags: [],
    projectExpenses: [],
    categorySplits: [],
    items: [],
  };
}

describe('public read controllers (HTTP)', () => {
  let app: INestApplication;
  let token: ReturnType<typeof tokenRow>;
  let expenses: ReturnType<typeof expenseRow>[];
  let detail: ReturnType<typeof expenseRow> | null;
  let grantAccountRows: any[] = [];
  let memberRows: any[] = [];

  const prisma = {
    oAuthToken: { findUnique: jest.fn(async () => token) },
    oAuthGrant: { updateMany: jest.fn(async () => ({ count: 1 })) },
    account: {
      findUnique: jest.fn(async (args: any) =>
        args.where.id === 'acc-b'
          ? { id: 'acc-b', name: 'Firm', type: 'business', currencyCode: 'EUR' }
          : { id: 'acc-1', name: 'Home', type: 'personal', currencyCode: 'PLN' },
      ),
    },
    oAuthGrantAccount: { findMany: jest.fn(async () => grantAccountRows) },
    accountMember: {
      findUnique: jest.fn(async () => ({ role: 'owner' })),
      findMany: jest.fn(async () => memberRows),
    },
    expense: {
      findMany: jest.fn(async (args: any) => (args.select?.id && Object.keys(args.select).length === 1 ? [] : expenses)),
      findFirst: jest.fn(async () => detail),
    },
    // DB clock for the changes feed's safety lag; well ahead of every fixture.
    $queryRaw: jest.fn(async () => [{ now: new Date('2030-01-01T00:00:00.000Z') }]),
    // The query filters (publicCategoryWhere); the mock returns what such a query yields.
    category: {
      findMany: jest.fn(async () => [
        { id: 'c-1', name: 'Food', parentId: null, icon: 'food', color: '#f00', type: 'expense' },
        { id: 'c-3', name: 'Snacks', parentId: 'c-1', icon: null, color: null, type: 'expense' },
      ]),
    },
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [PublicAccountController, PublicAccountsController, PublicCategoriesController, PublicExpensesController],
      providers: [
        PublicApiAuthGuard,
        PublicApiEnabledGuard,
        PublicApiExceptionFilter,
        { provide: PrismaService, useValue: prisma },
        { provide: PublicExpenseWriteAdapter, useValue: {} },
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
    token = tokenRow(['expenses:read', 'categories:read']);
    expenses = [expenseRow()];
    detail = expenseRow();
    jest.clearAllMocks();
    grantAccountRows = [];
    memberRows = [];
  });

  const get = (path: string) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${TOKEN}`);

  describe('GET /public/v1/account', () => {
    it('needs no scope and never returns an e-mail', async () => {
      token = tokenRow([]);
      const res = await get('/public/v1/account');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: 'acc-1',
        name: 'Home',
        type: 'personal',
        base_currency: 'PLN',
        role: 'owner',
        encryption: 'none',
        read_only: false,
        user: { id: 'user-1', name: 'Mikhail', base_currency: 'PLN' },
      });
      expect(JSON.stringify(res.body)).not.toContain('@');
    });

    it('a tier 1 account is text-encrypted and read-only', async () => {
      token = tokenRow([], 1);
      const res = await get('/public/v1/account');
      expect(res.body).toMatchObject({ encryption: 'text', read_only: true });
    });
  });

  describe('GET /public/v1/accounts and X-Account-Id', () => {
    const acct = (id: string, name: string, type: string, tier = 0, tripStatus: string | null = null) => ({
      account: { id, name, type, currencyCode: 'PLN', encryptionTier: tier, tripStatus },
    });

    it('lists every granted account with access and status, and nothing about the user', async () => {
      token = tokenRow(['expenses:read', 'expenses:write']);
      token.grant.accounts = ['acc-a', 'acc-b', 'acc-s'].map((accountId) => ({ accountId, account: { encryptionTier: 0, monthAnchorDay: null } }));
      grantAccountRows = [acct('acc-a', 'Personal', 'personal'), acct('acc-b', 'Firm', 'business', 1), acct('acc-s', 'Family', 'shared')];
      memberRows = [
        { accountId: 'acc-a', role: 'owner' },
        { accountId: 'acc-b', role: 'editor' },
        { accountId: 'acc-s', role: 'viewer' },
      ];
      const res = await get('/public/v1/accounts');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        data: [
          { id: 'acc-a', name: 'Personal', type: 'personal', base_currency: 'PLN', access: 'read_write', active: true, reason: null },
          { id: 'acc-b', name: 'Firm', type: 'business', base_currency: 'PLN', access: 'read', active: true, reason: null },
          { id: 'acc-s', name: 'Family', type: 'shared', base_currency: 'PLN', access: 'read', active: false, reason: 'role' },
        ],
      });
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('@');
      for (const row of res.body.data) expect(Object.keys(row).sort()).toEqual(['access', 'active', 'base_currency', 'id', 'name', 'reason', 'type']);
    });

    it('hides name, type and currency of an account the grantor is no longer a member of; a viewer keeps them', async () => {
      token = tokenRow([]);
      token.grant.accounts = ['acc-v', 'acc-x'].map((accountId) => ({ accountId, account: { encryptionTier: 0, monthAnchorDay: null } }));
      grantAccountRows = [acct('acc-v', 'Viewed', 'shared'), acct('acc-x', 'Renamed Secret', 'business')];
      memberRows = [{ accountId: 'acc-v', role: 'viewer' }];
      const res = await get('/public/v1/accounts');
      expect(res.body.data).toEqual([
        { id: 'acc-v', name: 'Viewed', type: 'shared', base_currency: 'PLN', access: 'read', active: false, reason: 'role' },
        { id: 'acc-x', name: null, type: null, base_currency: null, access: 'read', active: false, reason: 'role' },
      ]);
      expect(JSON.stringify(res.body)).not.toContain('Renamed Secret');
    });

    it('an archived trip is active, read-only and says why', async () => {
      token = tokenRow([], 0);
      token.grant.accounts = [{ accountId: 'acc-t', account: { encryptionTier: 0, monthAnchorDay: null } }];
      grantAccountRows = [acct('acc-t', 'Trip', 'trip', 0, 'archived')];
      memberRows = [{ accountId: 'acc-t', role: 'owner' }];
      const res = await get('/public/v1/accounts');
      expect(res.body.data).toEqual([
        { id: 'acc-t', name: 'Trip', type: 'trip', base_currency: 'PLN', access: 'read', active: true, reason: 'archived' },
      ]);
    });

    it('/account describes the addressed account', async () => {
      token = tokenRow([]);
      token.grant.accounts = ['acc-1', 'acc-b'].map((accountId) => ({ accountId, account: { encryptionTier: 0, monthAnchorDay: null } }));
      const res = await get('/public/v1/account').set('X-Account-Id', 'acc-b');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: 'acc-b', name: 'Firm', base_currency: 'EUR' });
      const missing = await get('/public/v1/account');
      expect(missing.status).toBe(400);
      expect(missing.body.error.code).toBe('account_required');
    });
  });

  describe('GET /public/v1/categories', () => {
    it('lists exactly what an expense write accepts: account-owned, live, expense type; snake_case', async () => {
      const res = await get('/public/v1/categories');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        data: [
          { id: 'c-1', name: 'Food', parent_id: null, icon: 'food', color: '#f00', type: 'expense', encrypted_fields: [] },
          { id: 'c-3', name: 'Snacks', parent_id: 'c-1', icon: null, color: null, type: 'expense', encrypted_fields: [] },
        ],
      });
      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // No `isSystem` branch: a global system row cannot be stored by the write path (Ruling 19).
          where: { accountId: 'acc-1', type: 'expense', isDeleted: false },
          select: { id: true, name: true, parentId: true, icon: true, color: true, type: true },
        }),
      );
    });

    it('a tier 1 account withholds category names and lists them', async () => {
      token = tokenRow(['categories:read'], 1);
      const res = await get('/public/v1/categories');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([
        { id: 'c-1', name: null, parent_id: null, icon: 'food', color: '#f00', type: 'expense', encrypted_fields: ['name'] },
        { id: 'c-3', name: null, parent_id: 'c-1', icon: null, color: null, type: 'expense', encrypted_fields: ['name'] },
      ]);
    });

    it('requires categories:read', async () => {
      token = tokenRow(['expenses:read']);
      const res = await get('/public/v1/categories');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('insufficient_scope');
    });
  });

  describe('GET /public/v1/expenses', () => {
    it('returns a page without items', async () => {
      const res = await get('/public/v1/expenses');
      expect(res.status).toBe(200);
      expect(res.body.has_more).toBe(false);
      expect(res.body.next_cursor).toBeNull();
      expect(res.body.data[0]).toMatchObject({ id: EXP_ID, amount: '12.50', date: '2026-10-31', has_receipt: false });
      expect(res.body.data[0]).not.toHaveProperty('items');
    });

    it('requires expenses:read', async () => {
      token = tokenRow(['categories:read']);
      const res = await get('/public/v1/expenses');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('insufficient_scope');
    });

    it.each([
      ['limit above 200', 'limit=201', 'limit'],
      ['limit 0', 'limit=0', 'limit'],
      ['a non-numeric limit', 'limit=abc', 'limit'],
      ['a datetime date_from', 'date_from=2026-10-01T00:00:00Z', 'date_from'],
      ['an impossible date_to', 'date_to=2026-02-30', 'date_to'],
      ['a non-uuid category_id', 'category_id=food', 'category_id'],
      ['a non-uuid project_id', 'project_id=1', 'project_id'],
      ['an unknown parameter', 'page=2', 'page'],
    ])('rejects %s with validation_failed', async (_label, qs, field) => {
      const res = await get(`/public/v1/expenses?${qs}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_failed');
      expect(Object.keys(res.body.error.details.fields)).toContain(field);
    });

    it('a malformed cursor is invalid_cursor', async () => {
      const res = await get('/public/v1/expenses?cursor=nope!');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('invalid_cursor');
    });

    it('a tier 1 account withholds text fields', async () => {
      token = tokenRow(['expenses:read'], 1);
      const res = await get('/public/v1/expenses');
      expect(res.body.data[0]).toMatchObject({ description: null, merchant: null, amount: '12.50' });
      expect(res.body.data[0].encrypted_fields).toEqual([
        'description',
        'notes',
        'merchant',
        'location.name',
        'items.description',
        'tags.name',
        'project.name',
      ]);
    });

    it.each(['merchant=bied', 'search=groc'])('a tier 1 account refuses the %s filter (no oracle on withheld text)', async (qs) => {
      token = tokenRow(['expenses:read'], 1);
      const res = await get(`/public/v1/expenses?${qs}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('account_encrypted');
      expect(prisma.expense.findMany).not.toHaveBeenCalled();
    });
  });

  describe('GET /public/v1/expenses/changes', () => {
    it('is routed to the feed, not captured by :id', async () => {
      expenses = [{ ...expenseRow(), isDeleted: false, isPlanned: false } as any];
      const res = await get('/public/v1/expenses/changes');
      expect(res.status).toBe(200);
      expect(prisma.expense.findFirst).not.toHaveBeenCalled();
      expect(res.body.has_more).toBe(false);
      expect(typeof res.body.next_cursor).toBe('string');
      expect(res.body.changes).toHaveLength(1);
      expect(res.body.changes[0].type).toBe('upsert');
      // The upsert carries the detail shape (with items) and no feed-internal flags.
      expect(res.body.changes[0].expense).toMatchObject({ id: EXP_ID, items: [], amount: '12.50' });
      expect(res.body.changes[0].expense).not.toHaveProperty('isDeleted');
      expect(res.body.changes[0].expense).not.toHaveProperty('is_planned');
    });

    it('emits deleted and planned rows as delete with deleted_at = updated_at', async () => {
      expenses = [
        { ...expenseRow(), id: 'e-del', isDeleted: true, isPlanned: false, updatedAt: new Date('2026-10-31T12:00:00.001Z') },
        { ...expenseRow(), id: 'e-plan', isDeleted: false, isPlanned: true, updatedAt: new Date('2026-10-31T12:00:00.002Z') },
      ] as any;
      const res = await get('/public/v1/expenses/changes');
      expect(res.body.changes).toEqual([
        { type: 'delete', id: 'e-del', deleted_at: '2026-10-31T12:00:00.001Z' },
        { type: 'delete', id: 'e-plan', deleted_at: '2026-10-31T12:00:00.002Z' },
      ]);
    });

    it('a tier 1 account gets upserts with text fields withheld', async () => {
      token = tokenRow(['expenses:read'], 1);
      expenses = [{ ...expenseRow(), isDeleted: false, isPlanned: false } as any];
      const res = await get('/public/v1/expenses/changes');
      expect(res.status).toBe(200);
      expect(res.body.changes[0].expense).toMatchObject({ description: null, merchant: null });
      expect(JSON.stringify(res.body)).not.toMatch(/Groceries|Biedronka/);
    });

    it('requires expenses:read', async () => {
      token = tokenRow(['receipts:read']);
      const res = await get('/public/v1/expenses/changes');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('insufficient_scope');
    });

    it.each([
      ['limit above 200', 'limit=201'],
      ['limit 0', 'limit=0'],
      ['an unknown parameter', 'since=2026-10-01'],
    ])('rejects %s with validation_failed', async (_label, qs) => {
      const res = await get(`/public/v1/expenses/changes?${qs}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_failed');
    });

    it('accepts limit=200 (the maximum)', async () => {
      expenses = [];
      const res = await get('/public/v1/expenses/changes?limit=200');
      expect(res.status).toBe(200);
      expect(prisma.expense.findMany.mock.calls[0][0].take).toBe(201);
    });

    it('a malformed cursor is invalid_cursor', async () => {
      const res = await get('/public/v1/expenses/changes?cursor=nope!');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('invalid_cursor');
    });
  });

  describe('GET /public/v1/expenses/:id/receipt', () => {
    const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const receiptToken = (tier = 0) => tokenRow(['receipts:read'], tier);

    it('streams the original bytes with sniffed type, inline filename, no-store and nosniff', async () => {
      token = receiptToken();
      detail = { id: EXP_ID, receiptImage: JPEG, receiptMimeType: 'text/html' } as any;
      const res = await get(`/public/v1/expenses/${EXP_ID}/receipt`).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['content-disposition']).toBe(`inline; filename="receipt-${EXP_ID}.jpg"`);
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.compare(res.body as Buffer, JPEG)).toBe(0);
      expect(prisma.expense.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: EXP_ID, accountId: 'acc-1', isDeleted: false, isPlanned: false } }),
      );
    });

    it('404s not_found when the expense has no image', async () => {
      token = receiptToken();
      detail = { id: EXP_ID, receiptImage: null } as any;
      const res = await get(`/public/v1/expenses/${EXP_ID}/receipt`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    });

    it('404s not_found when the expense is missing (deleted, planned, other account)', async () => {
      token = receiptToken();
      detail = null;
      const res = await get(`/public/v1/expenses/${EXP_ID}/receipt`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    });

    it('a tier 1 account is refused with account_encrypted before any lookup', async () => {
      token = receiptToken(1);
      detail = { id: EXP_ID, receiptImage: JPEG } as any;
      const res = await get(`/public/v1/expenses/${EXP_ID}/receipt`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('account_encrypted');
      expect(prisma.expense.findFirst).not.toHaveBeenCalled();
    });

    it('requires receipts:read (expenses:read is not enough)', async () => {
      token = tokenRow(['expenses:read']);
      detail = { id: EXP_ID, receiptImage: JPEG } as any;
      const res = await get(`/public/v1/expenses/${EXP_ID}/receipt`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('insufficient_scope');
    });
  });

  describe('GET /public/v1/expenses/:id', () => {
    it('returns the expense with items', async () => {
      const res = await get(`/public/v1/expenses/${EXP_ID}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: EXP_ID, items: [] });
      expect(prisma.expense.findFirst.mock.calls[0]).toBeDefined();
    });

    it('a tier 1 account withholds line-item descriptions, tag and project names', async () => {
      token = tokenRow(['expenses:read'], 1);
      detail = {
        ...expenseRow(),
        expenseTags: [{ tag: { id: 'tag-1', name: 'work' } }],
        projectExpenses: [{ project: { id: 'proj-1', name: 'Trip' } }],
        items: [
          {
            id: 'item-1',
            description: 'MLEKO 2% 1L',
            quantity: new Prisma.Decimal('1'),
            unitPrice: new Prisma.Decimal('3.5'),
            totalPrice: new Prisma.Decimal('3.5'),
            lineDiscount: new Prisma.Decimal('0'),
            categoryId: null,
          },
        ],
      } as any;
      const res = await get(`/public/v1/expenses/${EXP_ID}`);
      expect(res.status).toBe(200);
      expect(res.body.items[0]).toMatchObject({ id: 'item-1', description: null, total_price: '3.50' });
      expect(res.body.tags).toEqual([{ id: 'tag-1', name: null }]);
      expect(res.body.project).toEqual({ id: 'proj-1', name: null });
      expect(JSON.stringify(res.body)).not.toMatch(/MLEKO|"work"|"Trip"|Groceries|Biedronka/);
      expect(res.body.encrypted_fields).toEqual(expect.arrayContaining(['items.description', 'tags.name', 'project.name']));
    });

    it('404s not_found when missing (deleted, planned, other account all look the same)', async () => {
      detail = null;
      const res = await get(`/public/v1/expenses/${EXP_ID}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    });
  });
});
