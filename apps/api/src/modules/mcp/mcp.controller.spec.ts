import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { json, urlencoded } from 'express';
import * as request from 'supertest';
import { CacheService } from '../../common/cache/cache.service';
import { PrismaService } from '../../database/prisma.service';
import { GLOBAL_PREFIX_EXCLUDED_ROUTES } from '../../global-prefix-exclusions';
import { BudgetsService } from '../budgets/budgets.service';
import { McpEnabledGuard } from '../oauth/guards/mcp-enabled.guard';
import { PublicAnalyticsService } from '../public-api/public-analytics.service';
import { PublicApiAuthorizer } from '../public-api/public-api-authorizer.service';
import { PublicApiRateLimitService } from '../public-api/public-api-rate-limit.service';
import { MCP_BODY_LIMIT_BYTES, MCP_PATH, mcpBodyLimit } from './mcp-body-limit';
import { McpController } from './mcp.controller';

/**
 * The real Nest route with the app's own body parsing (main.ts: bodyParser off, json + urlencoded
 * with the rawBody `verify`, the global prefix with its exclusions, the global ValidationPipe), the
 * real PublicApiAuthorizer and rate-limit service — only Prisma and Redis are mocked.
 */
const RESOURCE = 'https://api.ai-budget.pl/mcp';
const METADATA = 'Bearer resource_metadata="https://api.ai-budget.pl/.well-known/oauth-protected-resource/mcp"';
const TOKEN = 'aba_at_mcp-good-token';
const EXP_ID = '00000000-0000-4000-8000-000000000001';

function tokenRow(resource: string | null) {
  return {
    kind: 'access',
    expiresAt: new Date(Date.now() + 3_600_000),
    resource,
    grant: {
      id: 'grant-1',
      userId: 'user-1',
      scopes: ['expenses:read', 'categories:read', 'incomes:read', 'budgets:read', 'analytics:read'],
      revokedAt: null,
      client: { id: 'client-db-1', name: 'Claude', status: 'active', deletedAt: null, rateLimitPerGrant: null, rateLimitPerClient: null },
      user: { id: 'user-1', email: 'u@example.com', name: 'U', currencyCode: 'PLN', timezone: 'Europe/Warsaw', defaultAccountId: 'acc-1', isActive: true },
      accounts: [{ accountId: 'acc-1', account: { encryptionTier: 0, monthAnchorDay: null } }],
    },
  };
}

function expenseRow() {
  return {
    id: EXP_ID,
    userId: 'user-1',
    amount: new Prisma.Decimal('12.5'),
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
    user: { name: 'U' },
    createdByOAuthClient: null,
    expenseTags: [],
    projectExpenses: [],
    categorySplits: [],
    items: [],
  };
}

describe('McpController (HTTP)', () => {
  let app: INestApplication;
  let token: ReturnType<typeof tokenRow> | null;
  let env: Record<string, string>;
  let logs: string[];

  const prisma = {
    oAuthToken: { findUnique: jest.fn(async () => token) },
    oAuthGrant: { updateMany: jest.fn(async () => ({ count: 1 })) },
    accountMember: { findUnique: jest.fn(async () => ({ role: 'owner' })) },
    expense: {
      // The has_receipt probe selects only `id`; it finds no receipt here.
      findMany: jest.fn(async (args: any) => (args.select?.id && Object.keys(args.select).length === 1 ? [] : [expenseRow()])),
    },
  };
  const cache = {
    setIfAbsent: jest.fn(async () => false),
    incrementWindowWithTtl: jest.fn(async (): Promise<{ hits: number; ttlMs: number }> => ({ hits: 1, ttlMs: 60_000 })),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        McpEnabledGuard,
        PublicApiAuthorizer,
        PublicApiRateLimitService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
        { provide: BudgetsService, useValue: {} },
        { provide: PublicAnalyticsService, useValue: {} },
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } },
      ],
    }).compile();
    app = mod.createNestApplication({ bodyParser: false });
    // As main.ts does: the route-scoped /mcp parser first, then the app-wide ones.
    app.use(MCP_PATH, mcpBodyLimit());
    app.use(json({ limit: '50mb', verify: (req: any, _res, buf) => void (req.rawBody = buf) }));
    app.use(urlencoded({ extended: true, verify: (req: any, _res, buf) => void (req.rawBody = buf) }));
    app.setGlobalPrefix('api/v1', { exclude: GLOBAL_PREFIX_EXCLUDED_ROUTES });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
    );
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    env = { PUBLIC_API_ENABLED: 'true', MCP_ENABLED: 'true' };
    token = tokenRow(RESOURCE);
    logs = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation((m: unknown) => void logs.push(String(m)));
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((m: unknown) => void logs.push(String(m)));
  });

  afterEach(() => jest.restoreAllMocks());

  const rpc = (body: unknown, auth: string | null = `Bearer ${TOKEN}`) => {
    const r = request(app.getHttpServer())
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json');
    if (auth) r.set('Authorization', auth);
    return r.send(JSON.stringify(body));
  };

  it('404 when MCP_ENABLED is off (and when PUBLIC_API_ENABLED is off)', async () => {
    env.MCP_ENABLED = 'false';
    expect((await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).status).toBe(404);
    env = { PUBLIC_API_ENABLED: 'false', MCP_ENABLED: 'true' };
    expect((await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).status).toBe(404);
    expect((await request(app.getHttpServer()).get('/mcp')).status).toBe(404);
    expect(prisma.oAuthToken.findUnique).not.toHaveBeenCalled();
  });

  it('is served at /mcp, never under /api/v1', async () => {
    expect((await request(app.getHttpServer()).post('/api/v1/mcp').send({})).status).toBe(404);
  });

  it('401 with resource_metadata header without a token', async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, null);
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe(METADATA);
    expect(prisma.oAuthToken.findUnique).not.toHaveBeenCalled();
  });

  it('401 with error="invalid_token" for an unknown token', async () => {
    token = null;
    const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe(`${METADATA}, error="invalid_token"`);
  });

  it('401 for a resource-less (public API) token', async () => {
    token = tokenRow(null);
    const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe(`${METADATA}, error="invalid_token"`);
  });

  it('GET /mcp is 405 (stateless: no SSE stream), and so is DELETE', async () => {
    const g = await request(app.getHttpServer()).get('/mcp').set('Authorization', `Bearer ${TOKEN}`);
    expect(g.status).toBe(405);
    expect(g.headers.allow).toBe('POST');
    const d = await request(app.getHttpServer()).delete('/mcp').set('Authorization', `Bearer ${TOKEN}`);
    expect(d.status).toBe(405);
  });

  it('initialize -> tools/list -> tools/call over the real route and the app body parsers', async () => {
    const init = await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'spec', version: '1.0.0' } },
    });
    expect(init.status).toBe(200);
    expect(init.headers['content-type']).toMatch(/application\/json/);
    expect(init.headers['mcp-session-id']).toBeUndefined();
    expect(init.body.result.serverInfo.name).toBeTruthy();
    expect(init.body.result.capabilities.tools).toBeDefined();

    const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }).set('mcp-protocol-version', '2025-06-18');
    expect(list.status).toBe(200);
    expect(list.body.result.tools).toHaveLength(9);

    const called = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_expenses', arguments: { limit: 10 } } }).set(
      'mcp-protocol-version',
      '2025-06-18',
    );
    expect(called.status).toBe(200);
    const result = called.body.result;
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      data: [{ id: EXP_ID, amount: '12.50', currency: 'PLN', merchant: 'Biedronka', has_receipt: false }],
      next_cursor: null,
      has_more: false,
    });
    expect(result.content[0].type).toBe('text');
    // The token's own resource was enforced on the call too (connection + tool authorization).
    expect(prisma.oAuthToken.findUnique).toHaveBeenCalledTimes(4);
    expect(prisma.expense.findMany.mock.calls[0][0].take).toBe(11);
    const all = logs.join('\n');
    expect(all).toMatch(/tool=list_expenses outcome=ok ms=\d+/);
    expect(all).not.toContain(TOKEN);
    expect(all).not.toContain('Biedronka');
  });

  it('over the rate limit, a tool call answers a tool error with the retry seconds (not a bare HTTP 429)', async () => {
    // Only the tool's own check counts (the connection-level pre-check does not).
    cache.incrementWindowWithTtl.mockResolvedValueOnce({ hits: 999, ttlMs: 12_000 });
    const res = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_expenses', arguments: {} } }).set(
      'mcp-protocol-version',
      '2025-06-18',
    );
    expect(res.status).toBe(200);
    expect(res.body.result.isError).toBe(true);
    expect(res.body.result.content[0].text).toBe('rate_limited: Too many requests on this connection. Retry in 12 seconds.');
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });

  it('a body that is not JSON is refused by the transport (415), never parsed as a form', async () => {
    const res = await request(app.getHttpServer())
      .post('/mcp')
      .set('Authorization', `Bearer ${TOKEN}`)
      .set('Accept', 'application/json, text/event-stream')
      .type('form')
      .send('jsonrpc=2.0&method=tools/list&id=1');
    expect(res.status).toBe(415);
  });

  it('one tools/call spends exactly one rate-limit unit of the connection; initialize and tools/list spend none', async () => {
    await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'spec', version: '1.0.0' } },
    });
    await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }).set('mcp-protocol-version', '2025-06-18');
    expect(cache.incrementWindowWithTtl).not.toHaveBeenCalled();
    await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_expenses', arguments: {} } }).set(
      'mcp-protocol-version',
      '2025-06-18',
    );
    const grantHits = cache.incrementWindowWithTtl.mock.calls.filter((c: unknown[]) => String(c[0]).startsWith('pa:g:'));
    expect(grantHits).toEqual([['pa:g:grant-1', 60_000]]);
  });

  it('a JSON-RPC batch (array body) is refused with 400 / -32600 before any token lookup', async () => {
    const res = await rpc([
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_expenses', arguments: {} } },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_expenses', arguments: {} } },
    ]);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ jsonrpc: '2.0', error: { code: -32600, message: expect.stringMatching(/batch/i) }, id: null });
    expect(prisma.oAuthToken.findUnique).not.toHaveBeenCalled();
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });

  it('a body over 128 KB is refused with 413 before authentication, by the route-scoped parser', async () => {
    expect(MCP_BODY_LIMIT_BYTES).toBe(128 * 1024);
    const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { pad: 'a'.repeat(MCP_BODY_LIMIT_BYTES) } });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe(-32000);
    expect(prisma.oAuthToken.findUnique).not.toHaveBeenCalled();
  });

  it('malformed JSON is a JSON-RPC parse error (400 / -32700)', async () => {
    const res = await request(app.getHttpServer())
      .post('/mcp')
      .set('Authorization', `Bearer ${TOKEN}`)
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send('{"jsonrpc":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(-32700);
  });

  it('a JSON-RPC notification is accepted with 202', async () => {
    const res = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }).set('mcp-protocol-version', '2025-06-18');
    expect(res.status).toBe(202);
  });
});
