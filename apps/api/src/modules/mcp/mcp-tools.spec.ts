import { Logger } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { PublicApiError } from '../public-api/public-api-error';
import { listPublicExpenses, getPublicExpense } from '../public-api/public-expenses.query';
import { listPublicIncomes } from '../public-api/public-incomes.query';
import { toPublicExpense } from '../public-api/mappers/public-expense.mapper';
import { listConnectedAccounts } from '../public-api/public-read.views';
import { createMcpServer, type McpServerContext } from './mcp-server.factory';
import { MCP_MAX_ROWS, MCP_TOOL_NAMES } from './mcp-tools';

jest.mock('../public-api/public-expenses.query', () => ({
  listPublicExpenses: jest.fn(),
  getPublicExpense: jest.fn(),
}));
jest.mock('../public-api/public-incomes.query', () => ({
  listPublicIncomes: jest.fn(),
  getPublicIncome: jest.fn(),
}));
jest.mock('../public-api/mappers/public-expense.mapper', () => ({
  toPublicExpense: jest.fn((row: { id: string; items?: unknown[] }, opts: { encryptionTier: number }) => ({
    id: row.id,
    tier: opts.encryptionTier,
    amount: '1.00',
    currency: 'PLN',
    date: '2026-10-31',
    ...(row.items ? { items: row.items } : {}),
  })),
}));
jest.mock('../public-api/public-read.views', () => ({
  ...jest.requireActual('../public-api/public-read.views'),
  listConnectedAccounts: jest.fn(),
}));

const RESOURCE = 'https://api.example.test/mcp';
const BEARER = 'aba_at_secret-token-value';
const ACC2 = '00000000-0000-4000-8000-0000000000a2';
const ACC9 = '00000000-0000-4000-8000-0000000000a9';
const ACC_ENC = '00000000-0000-4000-8000-0000000000ae';
const EXP_ID = '00000000-0000-4000-8000-000000000e01';

function authorized(over: { accountId?: string; encryptionTier?: number } = {}) {
  return {
    user: { id: 'user-1', email: 'u@example.com', name: 'U', currencyCode: 'PLN' },
    oauth: {
      clientDbId: 'c-1',
      clientName: 'Claude',
      grantId: 'grant-1',
      scopes: ['expenses:read', 'incomes:read'],
      grantAccountIds: ['acc-1'],
      encryptionTier: over.encryptionTier ?? 0,
    },
    accountId: over.accountId ?? 'acc-1',
    accountRole: 'owner',
    monthAnchorDay: null,
    rateLimit: { limit: 120, remaining: 100 },
  };
}

describe('MCP tools', () => {
  let client: Client;
  let authorize: jest.Mock;
  let analytics: { summary: jest.Mock; byCategory: jest.Mock; monthly: jest.Mock };
  let budgets: { findAll: jest.Mock; getAccountAnchorDay: jest.Mock; getProgress: jest.Mock };
  let prisma: { category: { findMany: jest.Mock } };
  let logs: string[];

  beforeEach(async () => {
    jest.clearAllMocks();
    logs = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation((m: unknown) => void logs.push(String(m)));
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((m: unknown) => void logs.push(String(m)));
    authorize = jest.fn(async () => authorized());
    analytics = {
      summary: jest.fn(async () => ({ currency: 'PLN', total_expenses: '10.00' })),
      byCategory: jest.fn(async () => ({ currency: 'PLN', data: [] })),
      monthly: jest.fn(async () => ({ currency: 'PLN', data: [] })),
    };
    budgets = { findAll: jest.fn(async () => []), getAccountAnchorDay: jest.fn(async () => 1), getProgress: jest.fn() };
    prisma = { category: { findMany: jest.fn(async () => []) } };
    const ctx: McpServerContext = {
      bearer: BEARER,
      resource: RESOURCE,
      authorizer: { authorize } as never,
      prisma: prisma as never,
      budgets: budgets as never,
      analytics: analytics as never,
    };
    const server = createMcpServer(ctx);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    client = new Client({ name: 'spec', version: '1.0.0' });
    await client.connect(clientSide);
  });

  afterEach(async () => {
    await client.close();
    jest.restoreAllMocks();
  });

  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }) as Promise<any>;
  const text = (r: any) => (r.content as Array<{ text: string }>).map((c) => c.text).join('\n');

  it('tools/list returns exactly the nine tools, all read-only', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'get_budget',
        'get_expense',
        'get_income',
        'get_spending_summary',
        'list_accounts',
        'list_budgets',
        'list_categories',
        'list_expenses',
        'list_incomes',
      ].sort(),
    );
    expect([...MCP_TOOL_NAMES].sort()).toEqual(tools.map((t) => t.name).sort());
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.annotations?.destructiveHint).toBe(false);
      expect(t.description).toMatch(/read-only/i);
    }
    for (const t of tools.filter((x) => x.name !== 'list_accounts')) expect(t.description).toMatch(/account's currency/);
    for (const t of tools.filter((x) => ['list_expenses', 'list_incomes'].includes(x.name))) {
      expect(t.description).toMatch(/next_cursor/);
      expect(t.description).toMatch(/200/);
    }
  });

  it('no write or receipt tool exists', async () => {
    const { tools } = await client.listTools();
    for (const t of tools) {
      expect(t.name).not.toMatch(/create|update|delete|write|receipt|set_|add_|remove/i);
      expect(JSON.stringify(t.inputSchema)).not.toMatch(/receipt/i);
    }
  });

  it('list_expenses authorizes on the MCP resource for the addressed account and maps through toPublicExpense with its encryptionTier', async () => {
    authorize.mockResolvedValue(authorized({ accountId: ACC2, encryptionTier: 1 }));
    (listPublicExpenses as jest.Mock).mockResolvedValue({ rows: [{ id: 'e-1' }, { id: 'e-2' }], nextCursor: 'CUR', hasMore: true });

    const r = await call('list_expenses', { account_id: ACC2, from: '2026-10-01', to: '2026-10-31', min_amount: 5, max_amount: 20.5 });

    expect(authorize).toHaveBeenCalledWith(BEARER, {
      requiredScopes: ['expenses:read'],
      tokenOnly: false,
      connectionLevel: false,
      accountId: ACC2,
      resource: RESOURCE,
    });
    expect(listPublicExpenses).toHaveBeenCalledWith(prisma, ACC2, {
      date_from: '2026-10-01',
      date_to: '2026-10-31',
      category_id: undefined,
      search: undefined,
      min_amount: '5',
      max_amount: '20.5',
      limit: 50,
      cursor: undefined,
    });
    expect(toPublicExpense).toHaveBeenCalledWith({ id: 'e-1' }, { encryptionTier: 1, includeItems: false });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toEqual({ data: [expect.objectContaining({ id: 'e-1', tier: 1 }), expect.objectContaining({ id: 'e-2', tier: 1 })], next_cursor: 'CUR', has_more: true });
    expect(text(r)).toContain('CUR');
  });

  it('limit above 200 is clamped', async () => {
    (listPublicExpenses as jest.Mock).mockResolvedValue({ rows: [], nextCursor: null, hasMore: false });
    await call('list_expenses', { limit: 5000 });
    expect(MCP_MAX_ROWS).toBe(200);
    expect((listPublicExpenses as jest.Mock).mock.calls[0][2].limit).toBe(200);
  });

  it('a tier-1 search is refused as account_encrypted naming the account, not answered with an empty list', async () => {
    authorize.mockResolvedValue(authorized({ accountId: ACC9, encryptionTier: 1 }));
    const r = await call('list_expenses', { account_id: ACC9, search: 'coffee' });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/^account_encrypted: /);
    expect(text(r)).toContain(ACC9);
    expect(listPublicExpenses).not.toHaveBeenCalled();
  });

  it('account_required becomes a tool error mentioning list_accounts', async () => {
    authorize.mockRejectedValue(new PublicApiError(400, 'account_required', 'This connection covers several accounts. Send the X-Account-Id header.'));
    const r = await call('list_expenses', {});
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/^account_required: /);
    expect(text(r)).toContain('list_accounts');
    expect(text(r)).toContain('account_id');
    expect(text(r)).not.toContain('X-Account-Id');
  });

  it('account_encrypted becomes a tool error naming the account', async () => {
    authorize.mockRejectedValue(new PublicApiError(403, 'account_encrypted', 'This account is end-to-end encrypted and cannot be used through the API.'));
    const r = await call('get_expense', { account_id: ACC_ENC, id: EXP_ID });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/^account_encrypted: /);
    expect(text(r)).toContain(ACC_ENC);
    expect(getPublicExpense).not.toHaveBeenCalled();
  });

  it('rate_limited carries retry seconds', async () => {
    const err = new PublicApiError(429, 'rate_limited', 'Too many requests.');
    err.retryAfterSec = 37;
    authorize.mockRejectedValue(err);
    const r = await call('list_incomes', {});
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/^rate_limited: /);
    expect(text(r)).toContain('37 seconds');
    expect(listPublicIncomes).not.toHaveBeenCalled();
  });

  it('list_accounts is token-only and connection-level, and returns listConnectedAccounts as is', async () => {
    const body = { data: [{ id: 'acc-1', name: 'Home', type: 'personal', base_currency: 'PLN', access: 'read', active: true, reason: null }] };
    (listConnectedAccounts as jest.Mock).mockResolvedValue(body);
    const r = await call('list_accounts', { account_id: 'ignored' });
    expect(authorize).toHaveBeenCalledWith(BEARER, {
      requiredScopes: [],
      tokenOnly: true,
      connectionLevel: true,
      accountId: null,
      resource: RESOURCE,
    });
    expect(listConnectedAccounts).toHaveBeenCalledWith(prisma, 'grant-1', 'user-1', ['expenses:read', 'incomes:read']);
    expect(r.structuredContent).toEqual(body);
  });

  it('get_spending_summary routes group_by to the analytics service with the account tier', async () => {
    authorize.mockResolvedValue(authorized({ accountId: 'acc-1', encryptionTier: 1 }));
    await call('get_spending_summary', { from: '2026-10-01', to: '2026-10-31', group_by: 'total' });
    expect(analytics.summary).toHaveBeenCalledWith('acc-1', 'user-1', { from: '2026-10-01', to: '2026-10-31' }, 1);
    await call('get_spending_summary', { from: '2026-10-01', to: '2026-10-31', group_by: 'category' });
    expect(analytics.byCategory).toHaveBeenCalledWith('acc-1', 'user-1', { from: '2026-10-01', to: '2026-10-31', type: 'expense' }, 1);
    await call('get_spending_summary', { from: '2026-01-01', to: '2026-10-31', group_by: 'month' });
    expect(analytics.monthly).toHaveBeenCalledWith('acc-1', 'user-1', { from: '2026-01-01', to: '2026-10-31' }, 1);
    expect(authorize).toHaveBeenLastCalledWith(BEARER, expect.objectContaining({ requiredScopes: ['analytics:read'] }));
  });

  it('get_expense caps line items at 200, flags the cut and says so', async () => {
    (getPublicExpense as jest.Mock).mockResolvedValue({ id: EXP_ID, items: Array.from({ length: 450 }, (_, i) => ({ n: i })) });
    const r = await call('get_expense', { id: EXP_ID });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.items).toHaveLength(200);
    expect(r.structuredContent.items_truncated).toBe(true);
    expect(r.structuredContent.items_total).toBe(450);
    expect(text(r)).toContain('Showing 200 of 450 line items');

    (getPublicExpense as jest.Mock).mockResolvedValue({ id: EXP_ID, items: [{ n: 1 }] });
    const small = await call('get_expense', { id: EXP_ID });
    expect(small.structuredContent.items).toHaveLength(1);
    expect(small.structuredContent).not.toHaveProperty('items_truncated');
  });

  it('a non-UUID id or an account_id with a comma is a validation error before any authorization', async () => {
    const badId = await call('get_expense', { id: 'not-an-id' });
    expect(badId.isError).toBe(true);
    expect(text(badId)).toMatch(/UUID/);
    const comma = await call('list_expenses', { account_id: `${ACC2},${ACC9}` });
    expect(comma.isError).toBe(true);
    expect(text(comma)).toContain('account_id');
    expect(text(comma)).not.toContain('X-Account-Id');
    expect(authorize).not.toHaveBeenCalled();
  });

  it('a REST message naming X-Account-Id is reworded to account_id', async () => {
    authorize.mockRejectedValue(
      new PublicApiError(400, 'validation_failed', 'The request is invalid.', { fields: { 'X-Account-Id': ['X-Account-Id must be sent at most once'] } }),
    );
    const r = await call('list_expenses', {});
    expect(text(r)).not.toContain('X-Account-Id');
    expect(text(r)).toContain('account_id');
  });

  it('caps a non-paginated list at 200 rows and says so', async () => {
    prisma.category.findMany.mockResolvedValue(
      Array.from({ length: 250 }, (_, i) => ({ id: `c-${i}`, name: `C${i}`, parentId: null, icon: null, color: null, type: 'expense' })),
    );
    const r = await call('list_categories', {});
    expect(r.structuredContent.data).toHaveLength(200);
    expect(text(r)).toContain('200 of 250');
  });

  it('an unexpected failure is internal_error without its message, and logs carry only tool, outcome and ms', async () => {
    (listPublicExpenses as jest.Mock).mockRejectedValue(new Error('Biedronka 12.50 leaked from a row'));
    const r = await call('list_expenses', {});
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/^internal_error: /);
    expect(text(r)).not.toContain('Biedronka');
    const all = logs.join('\n');
    expect(all).toMatch(/tool=list_expenses outcome=internal_error ms=\d+ err=Error$/m);
    expect(all).not.toContain('Biedronka');
    expect(all).not.toContain(BEARER);
  });

  it('internal_error logs the error class name only (a TypeError, a custom name, a non-Error)', async () => {
    class PrismaClientKnownRequestError extends Error {
      constructor(m: string) {
        super(m);
        this.name = 'PrismaClientKnownRequestError';
      }
    }
    (listPublicExpenses as jest.Mock).mockRejectedValueOnce(new PrismaClientKnownRequestError('amount 99.99 for Lidl'));
    await call('list_expenses', {});
    (listPublicExpenses as jest.Mock).mockRejectedValueOnce(new TypeError('x of undefined'));
    await call('list_expenses', {});
    const weird = new Error('m');
    weird.name = 'Biedronka 12.50 <script>';
    (listPublicExpenses as jest.Mock).mockRejectedValueOnce(weird);
    await call('list_expenses', {});
    (listPublicExpenses as jest.Mock).mockRejectedValueOnce('a string with Żabka 3.20');
    await call('list_expenses', {});
    const all = logs.join('\n');
    expect(all).toContain('outcome=internal_error');
    expect(all).toMatch(/err=PrismaClientKnownRequestError/);
    expect(all).toMatch(/err=TypeError/);
    expect(all).toMatch(/err=Error/);
    expect(all).toMatch(/err=non-error/);
    for (const leak of ['Lidl', '99.99', 'undefined', 'Biedronka', 'Żabka']) expect(all).not.toContain(leak);
  });

  it('logs a successful call as outcome=ok', async () => {
    (listPublicExpenses as jest.Mock).mockResolvedValue({ rows: [], nextCursor: null, hasMore: false });
    await call('list_expenses', {});
    expect(logs.join('\n')).toMatch(/tool=list_expenses outcome=ok ms=\d+$/m);
  });
});
