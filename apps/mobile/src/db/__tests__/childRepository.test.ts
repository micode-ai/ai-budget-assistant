/**
 * childRepository — raw-SQL data access for child costs.
 *
 * `./client` resolves to `client.native.ts`, which opens a real expo-sqlite
 * database at import time, so the mock boundary is `../client` (same as the
 * other repository tests). The mock records every statement; reads are
 * answered from `nextRows`.
 */
import {
  getChildren,
  upsertChild,
  getChildServerIdMap,
  getExpenseChildLinks,
  getLinksForExpense,
  replaceExpenseChildLinks,
  enqueueChildChange,
  getQueuedChildChanges,
  markLinesUndeliverable,
  UNDELIVERABLE_LINE_ERROR,
  getPendingAttributionExpenseIds,
  deleteQueuedChildChanges,
  recordChildQueueFailure,
  getChildServerIds,
  getUnsyncedExpenseIds,
  getUnsyncedItemIds,
  clearAllChildData,
} from '../childRepository';
import {
  setExpenseItemChild,
  clearExpenseItemChildren,
  getAttributedItems,
  replaceItemsForExpense,
} from '../expenseItemRepository';
import { setIncomeChildBenefit } from '../incomeRepository';

type Params = (string | number | null)[];

const calls: { sql: string; params: Params }[] = [];
let nextRows: unknown[][] = [];

const mockExecuteSql = jest.fn(async (sql: string, params: Params = []) => {
  calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
  return nextRows.shift() ?? [];
});

jest.mock('../client', () => ({
  executeSql: (sql: string, params: Params) => mockExecuteSql(sql, params),
  withTransaction: (task: () => Promise<void>) => task(),
}));

const childRow = {
  id: 'c-1',
  server_id: 'srv-c-1',
  account_id: 'acc-1',
  name: 'Ala',
  color: '#ff0000',
  archived_at: null,
  created_at: 1,
  updated_at: 2,
  is_deleted: 0,
  sync_status: 'synced',
  sync_version: 0,
};

beforeEach(() => {
  calls.length = 0;
  nextRows = [];
  mockExecuteSql.mockClear();
});

describe('children', () => {
  it('getChildren excludes archived unless includeArchived', async () => {
    await getChildren('acc-1', false);
    expect(calls[0].sql).toContain('archived_at IS NULL');
    expect(calls[0].params).toEqual(['acc-1']);

    await getChildren('acc-1', true);
    expect(calls[1].sql).not.toContain('archived_at IS NULL');
    expect(calls[1].sql).toContain('is_deleted = 0');
  });

  it('maps a row to a Child whose clientId is its local id', async () => {
    nextRows = [[{ ...childRow, archived_at: Date.UTC(2026, 0, 2) }]];
    const [child] = await getChildren('acc-1', true);
    expect(child).toEqual({
      id: 'c-1',
      accountId: 'acc-1',
      clientId: 'c-1',
      name: 'Ala',
      color: '#ff0000',
      archivedAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('upsertChild writes every column with one placeholder per param', async () => {
    await upsertChild({
      id: 'c-1',
      serverId: null,
      accountId: 'acc-1',
      name: 'Ala',
      color: undefined,
      archivedAt: null,
      isDeleted: false,
      syncStatus: 'pending',
      updatedAt: 5,
    });
    const { sql, params } = calls[0];
    expect(sql).toMatch(/^INSERT INTO children/);
    expect(sql).toContain('ON CONFLICT(id) DO UPDATE');
    const placeholders = (sql.match(/VALUES \(([^)]*)\)/)![1].match(/\?/g) || []).length;
    expect(placeholders).toBe(params.length);
    // A local write with no server id must not erase one learned earlier.
    expect(sql).toContain('server_id = COALESCE(excluded.server_id, children.server_id)');
  });

  it('getChildServerIdMap maps server PK -> local id', async () => {
    nextRows = [[{ id: 'c-1', server_id: 'srv-c-1' }, { id: 'c-2', server_id: null }]];
    const map = await getChildServerIdMap('acc-1');
    expect(map.get('srv-c-1')).toBe('c-1');
    expect(map.get('c-1')).toBe('c-1');
    expect(map.get('c-2')).toBe('c-2');
  });
});

describe('expense child links', () => {
  it('getExpenseChildLinks reads live links of live expenses in the account', async () => {
    nextRows = [[{ expense_id: 'e-1', child_id: 'c-1', share: 0.5 }]];
    const links = await getExpenseChildLinks('acc-1');
    expect(calls[0].sql).toContain('JOIN expenses e ON e.id = ec.expense_id');
    expect(calls[0].sql).toContain('e.account_id = ?');
    expect(calls[0].sql).toContain('ec.is_deleted = 0');
    expect(links).toEqual([{ expenseId: 'e-1', childId: 'c-1', share: 0.5 }]);
  });

  it('getLinksForExpense returns live links only', async () => {
    nextRows = [[{ expense_id: 'e-1', child_id: 'c-1', share: 1 }]];
    const links = await getLinksForExpense('e-1');
    expect(calls[0].params).toEqual(['e-1']);
    expect(calls[0].sql).toContain('is_deleted = 0');
    expect(links).toEqual([{ expenseId: 'e-1', childId: 'c-1', share: 1 }]);
  });

  it('replaceExpenseChildLinks soft-deletes the previous links, then upserts the new set', async () => {
    await replaceExpenseChildLinks('e-1', [
      { childId: 'c-1', share: 0.5 },
      { childId: 'c-2', share: 0.5 },
    ]);
    expect(calls[0].sql).toMatch(/^UPDATE expense_children SET is_deleted = 1/);
    expect(calls[0].params).toEqual([expect.any(Number), 'e-1']);
    expect(calls[1].sql).toMatch(/^INSERT INTO expense_children/);
    expect(calls[1].sql).toContain('ON CONFLICT(expense_id, child_id) DO UPDATE SET share = excluded.share, is_deleted = 0');
    expect(calls[1].params).toEqual(expect.arrayContaining(['e-1', 'c-1', 0.5]));
    expect(calls[2].params).toEqual(expect.arrayContaining(['e-1', 'c-2', 0.5]));
    expect(calls).toHaveLength(3);
  });

  it('replaceExpenseChildLinks with [] only removes', async () => {
    await replaceExpenseChildLinks('e-1', []);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/^UPDATE expense_children SET is_deleted = 1/);
  });
});

describe('line items and incomes', () => {
  it('setExpenseItemChild writes the child (or NULL)', async () => {
    await setExpenseItemChild('i-1', 'c-1');
    await setExpenseItemChild('i-2', null);
    expect(calls[0].sql).toBe('UPDATE expense_items SET child_id = ? WHERE id = ?');
    expect(calls[0].params).toEqual(['c-1', 'i-1']);
    expect(calls[1].params).toEqual([null, 'i-2']);
  });

  it('clearExpenseItemChildren returns the ids it cleared', async () => {
    nextRows = [[{ id: 'i-1' }, { id: 'i-3' }]];
    const ids = await clearExpenseItemChildren('e-1');
    expect(ids).toEqual(['i-1', 'i-3']);
    expect(calls[0].sql).toContain('child_id IS NOT NULL');
    expect(calls[1].sql).toBe(
      'UPDATE expense_items SET child_id = NULL WHERE expense_id = ? AND child_id IS NOT NULL',
    );
  });

  it('clearExpenseItemChildren skips the write when nothing is attributed', async () => {
    nextRows = [[]];
    expect(await clearExpenseItemChildren('e-1')).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('getAttributedItems scopes through the parent expense and maps childId', async () => {
    nextRows = [[{
      id: 'i-1', local_id: 'i-1', expense_id: 'e-1', description: 'Pampers', canonical_name: null,
      quantity: 1, unit_price: 50, total_price: 50, sort_order: 0, is_deleted: 0,
      sync_status: 'synced', sync_version: 0, created_at: 0, updated_at: 0, child_id: 'c-1',
    }]];
    const items = await getAttributedItems('acc-1');
    expect(calls[0].sql).toContain('JOIN expenses e ON e.id = ei.expense_id');
    expect(calls[0].sql).toContain('ei.child_id IS NOT NULL');
    expect(calls[0].params).toEqual(['acc-1']);
    expect(items[0].childId).toBe('c-1');
  });

  it('setIncomeChildBenefit writes the column', async () => {
    await setIncomeChildBenefit('inc-1', 'c-1');
    expect(calls[0].sql).toBe('UPDATE incomes SET child_benefit_child_id = ? WHERE id = ?');
    expect(calls[0].params).toEqual(['c-1', 'inc-1']);
  });
});

describe('sync queue', () => {
  it('enqueue stores JSON payload with the account', async () => {
    await enqueueChildChange({
      entityType: 'child',
      entityId: 'c-1',
      operation: 'create',
      payload: { name: 'Ala', clientId: 'c-1' },
      accountId: 'acc-1',
    });
    const { sql, params } = calls[0];
    expect(sql).toMatch(/^INSERT INTO sync_queue/);
    expect(params).toEqual(expect.arrayContaining(['child', 'c-1', 'create', JSON.stringify({ name: 'Ala', clientId: 'c-1' }), 'acc-1']));
  });

  it('getQueuedChildChanges reads only child-cost entity types, in insertion order', async () => {
    nextRows = [[
      { id: 'q1', entity_type: 'expense_child', entity_id: 'e-1:c-1', operation: 'delete', payload: '{"expenseId":"e-1","childId":"c-1","share":1}', account_id: 'acc-1', attempts: 0 },
    ]];
    const entries = await getQueuedChildChanges('acc-1');
    expect(calls[0].sql).toContain("entity_type IN ('child', 'expense_child', 'expense_item_child')");
    expect(calls[0].sql).toContain('ORDER BY created_at ASC, rowid ASC');
    expect(entries[0]).toEqual({
      id: 'q1',
      entityType: 'expense_child',
      entityId: 'e-1:c-1',
      operation: 'delete',
      payload: { expenseId: 'e-1', childId: 'c-1', share: 1 },
      accountId: 'acc-1',
      attempts: 0,
      undeliverableSince: null,
    });
  });

  it('getQueuedChildChanges reads the undeliverable stamp only from its own marker (R12)', async () => {
    nextRows = [[
      { id: 'q1', entity_type: 'expense_item_child', entity_id: 'i-1', operation: 'update', payload: '{}', account_id: 'acc-1', attempts: 0, last_error: UNDELIVERABLE_LINE_ERROR, last_attempt_at: 1000 },
      { id: 'q2', entity_type: 'expense_item_child', entity_id: 'i-2', operation: 'update', payload: '{}', account_id: 'acc-1', attempts: 1, last_error: 'HTTP 404', last_attempt_at: 2000 },
    ]];
    const entries = await getQueuedChildChanges('acc-1');
    expect(entries.map((e) => e.undeliverableSince)).toEqual([1000, null]);
  });

  it('markLinesUndeliverable keeps the first stamp and counts no attempt', async () => {
    await markLinesUndeliverable(['q1', 'q2'], 5000);
    const { sql, params } = calls[0];
    expect(sql).not.toContain('attempts');
    expect(sql).toContain('COALESCE(last_attempt_at, ?)');
    expect(params).toEqual([UNDELIVERABLE_LINE_ERROR, 5000, 5000, UNDELIVERABLE_LINE_ERROR, 'q1', 'q2']);
  });

  it('getPendingAttributionExpenseIds collects expenses with queued link/line changes', async () => {
    nextRows = [[
      { entity_type: 'expense_child', payload: '{"expenseId":"e-1","childId":"c-1","share":1}' },
      { entity_type: 'expense_item_child', payload: '{"expenseId":"e-2","itemId":"i-1","childId":null}' },
    ]];
    const ids = await getPendingAttributionExpenseIds('acc-1');
    expect([...ids].sort()).toEqual(['e-1', 'e-2']);
  });

  it('delete and failure bookkeeping address rows by id', async () => {
    await deleteQueuedChildChanges(['q1', 'q2']);
    expect(calls[0].sql).toBe('DELETE FROM sync_queue WHERE id IN (?, ?)');
    await deleteQueuedChildChanges([]);
    expect(calls).toHaveLength(1);
    await recordChildQueueFailure(['q1'], 'Entity not found');
    expect(calls[1].sql).toContain('attempts = attempts + 1');
    expect(calls[1].params).toEqual(['Entity not found', expect.any(Number), 'q1']);
  });
});

describe('fix round 1', () => {
  it('getChildServerIdMap ignores soft-deleted children', async () => {
    await getChildServerIdMap('acc-1');
    expect(calls[0].sql).toContain('is_deleted = 0');
  });

  it('getChildServerIds maps local id -> server PK', async () => {
    nextRows = [[{ id: 'L1', server_id: 'srv-1' }]];
    const map = await getChildServerIds('acc-1');
    expect(map.get('L1')).toBe('srv-1');
    expect(calls[0].sql).toContain('server_id IS NOT NULL');
  });

  it('getUnsyncedExpenseIds: no server PK and not synced', async () => {
    nextRows = [[{ id: 'e-1' }]];
    const ids = await getUnsyncedExpenseIds('acc-1');
    expect([...ids]).toEqual(['e-1']);
    expect(calls[0].sql).toContain("server_id IS NULL AND sync_status != 'synced'");
  });

  it('getUnsyncedItemIds skips the query for no ids', async () => {
    expect([...(await getUnsyncedItemIds([]))]).toEqual([]);
    expect(calls).toHaveLength(0);
    nextRows = [[{ id: 'i-1' }]];
    expect([...(await getUnsyncedItemIds(['i-1', 'i-2']))]).toEqual(['i-1']);
    expect(calls[0].params).toEqual(['i-1', 'i-2']);
  });

  it("replaceItemsForExpense carries a line's child to its server row by position and re-points the queue", async () => {
    nextRows = [
      // previous local rows
      [{ id: 'local-1', sort_order: 0, child_id: 'c-1' }, { id: 'local-2', sort_order: 1, child_id: null }],
      // queued line ids for the expense (local-1 has a queued change)
      [{ payload: '{"expenseId":"e-1","itemId":"local-1","childId":"c-1"}' }],
      [], // DELETE
      [], // INSERT srv-1
      [], // INSERT srv-2
      // queued line changes
      [{ id: 'q1', entity_id: 'local-1', payload: '{"expenseId":"e-1","itemId":"local-1","childId":"c-1"}' }],
    ];
    const base = {
      expenseId: 'e-1', description: 'x', quantity: 1, unitPrice: 1, totalPrice: 1,
      isDeleted: false, syncStatus: 'synced' as const, syncVersion: 0,
      createdAt: new Date(0), updatedAt: new Date(0),
    };
    await replaceItemsForExpense('e-1', [
      { ...base, id: 'srv-1', localId: 'srv-1', sortOrder: 0 },
      { ...base, id: 'srv-2', localId: 'srv-2', sortOrder: 1 },
    ]);
    const inserts = calls.filter((c) => c.sql.startsWith('INSERT INTO expense_items'));
    expect(inserts[0].params[0]).toBe('srv-1');
    expect(inserts[0].params[inserts[0].params.length - 2]).toBe('c-1');
    expect(inserts[1].params[inserts[1].params.length - 2]).toBeNull();
    const update = calls.find((c) => c.sql.startsWith('UPDATE sync_queue SET entity_id'));
    expect(update!.params).toEqual([
      'srv-1',
      JSON.stringify({ expenseId: 'e-1', itemId: 'srv-1', childId: 'c-1' }),
      'q1',
    ]);
  });

  it('clearAllChildData removes children, links and their queue rows only', async () => {
    await clearAllChildData();
    expect(calls.map((c) => c.sql)).toEqual([
      'DELETE FROM expense_children',
      'DELETE FROM children',
      "DELETE FROM sync_queue WHERE entity_type IN ('child', 'expense_child', 'expense_item_child')",
    ]);
  });
});

describe('fix round 2 — refetch keeps queued line intent; line presence by identity', () => {
  const base = {
    expenseId: 'e-1', description: 'x', quantity: 1, unitPrice: 1, totalPrice: 1,
    isDeleted: false, syncStatus: 'synced' as const, syncVersion: 0,
    createdAt: new Date(0), updatedAt: new Date(0),
  };
  const childParam = (c: { params: Params }) => c.params[c.params.length - 2];

  it('a same-id refetch keeps a queued local attribution over the server value', async () => {
    nextRows = [
      [{ id: 'srv-1', sort_order: 0, child_id: 'c-1' }],
      [{ payload: '{"expenseId":"e-1","itemId":"srv-1","childId":"c-1"}' }],
    ];
    await replaceItemsForExpense('e-1', [{ ...base, id: 'srv-1', localId: 'srv-1', sortOrder: 0, childId: null }]);
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO expense_items'))!;
    expect(childParam(insert)).toBe('c-1');
  });

  it("a same-id refetch takes the server's childId when nothing is queued", async () => {
    nextRows = [
      [{ id: 'srv-1', sort_order: 0, child_id: 'c-1' }, { id: 'srv-2', sort_order: 1, child_id: 'c-1' }],
      [],
    ];
    await replaceItemsForExpense('e-1', [
      { ...base, id: 'srv-1', localId: 'srv-1', sortOrder: 0, childId: null },
      { ...base, id: 'srv-2', localId: 'srv-2', sortOrder: 1, childId: 'c-2' },
    ]);
    const inserts = calls.filter((c) => c.sql.startsWith('INSERT INTO expense_items'));
    expect(childParam(inserts[0])).toBeNull();
    expect(childParam(inserts[1])).toBe('c-2');
  });

  it('an unknown server child (undefined) keeps the local value', async () => {
    nextRows = [[{ id: 'srv-1', sort_order: 0, child_id: 'c-1' }], []];
    await replaceItemsForExpense('e-1', [{ ...base, id: 'srv-1', localId: 'srv-1', sortOrder: 0 }]);
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO expense_items'))!;
    expect(childParam(insert)).toBe('c-1');
  });

  it('rows written from server data are marked server_known; local pending rows are not', async () => {
    await replaceItemsForExpense('e-1', [{ ...base, id: 'srv-1', localId: 'srv-1', sortOrder: 0 }]);
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO expense_items'))!;
    expect(insert.sql).toContain('server_known');
    expect(insert.params[insert.params.length - 1]).toBe(1);
  });

  it('an edited, server-known line (pending) is not treated as unsynced: presence is by identity', async () => {
    nextRows = [[]];
    const ids = await getUnsyncedItemIds(['srv-1']);
    expect([...ids]).toEqual([]);
    expect(calls[0].sql).toContain('COALESCE(server_known, 0) = 0');
    expect(calls[0].sql).not.toContain('sync_status');
  });
});
