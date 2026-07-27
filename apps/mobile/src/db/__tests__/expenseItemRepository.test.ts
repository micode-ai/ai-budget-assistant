/**
 * canonical_name round-trip through the actual repository functions.
 *
 * `./client` resolves to `client.native.ts`, which opens a real expo-sqlite
 * database as a module-load side effect (`SQLite.openDatabaseSync(...)`) —
 * that crashes under Jest, so the mock boundary is `../client` (mirrors
 * `shoppingListMappers.test.ts`). Unlike that file's bare `jest.fn()` stub,
 * this mock is a tiny in-memory table keyed by generic column-list/WHERE-id
 * parsing, so the REAL `insertExpenseItem` / `upsertExpenseItem` /
 * `updateExpenseItemInDb` / `loadItemsByExpenseId` SQL strings actually
 * execute against it — a genuine insert -> read (and update -> read)
 * round trip, not just a call-recording spy.
 */
type Row = Record<string, string | number | null>;

const table = new Map<string, Row>();

function parseInsertColumns(sql: string): string[] {
  const match = sql.match(/INSERT INTO expense_items \(([^)]+)\)/i);
  if (!match) throw new Error(`Could not parse INSERT column list from: ${sql}`);
  return match[1].split(',').map((c) => c.trim());
}

function parseUpdateSetColumns(sql: string): string[] {
  const match = sql.match(/UPDATE expense_items SET (.+) WHERE id = \?/i);
  if (!match) throw new Error(`Could not parse UPDATE SET clause from: ${sql}`);
  return match[1]
    .split(',')
    .map((clause) => clause.trim().split('=')[0].trim());
}

const mockExecuteSql = jest.fn(
  async (sql: string, params: (string | number | null)[] = []) => {
    const s = sql.trim();

    if (s.startsWith('INSERT INTO expense_items')) {
      const columns = parseInsertColumns(s);
      const row: Row = {};
      columns.forEach((col, i) => {
        row[col] = params[i];
      });
      table.set(String(row.id), row);
      return [];
    }

    if (s.startsWith('SELECT * FROM expense_items WHERE expense_id')) {
      const [expenseId] = params;
      return [...table.values()]
        .filter((r) => r.expense_id === expenseId && r.is_deleted === 0)
        .sort((a, b) => (a.sort_order as number) - (b.sort_order as number));
    }

    if (s.startsWith('UPDATE expense_items SET is_deleted = 1, updated_at = ?, sync_status = ? WHERE id')) {
      const [updatedAt, syncStatus, id] = params;
      const row = table.get(String(id));
      if (row) {
        row.is_deleted = 1;
        row.updated_at = updatedAt;
        row.sync_status = syncStatus;
      }
      return [];
    }

    if (s.startsWith('UPDATE expense_items SET')) {
      const columns = parseUpdateSetColumns(s);
      const id = params[params.length - 1];
      const row = table.get(String(id));
      if (row) {
        columns.forEach((col, i) => {
          row[col] = params[i];
        });
      }
      return [];
    }

    throw new Error(`mockExecuteSql: unrecognized SQL: ${sql}`);
  },
);

jest.mock('../client', () => ({
  executeSql: (sql: string, params: (string | number | null)[]) => mockExecuteSql(sql, params),
  withTransaction: jest.fn(),
}));

import {
  insertExpenseItem,
  upsertExpenseItem,
  updateExpenseItemInDb,
  loadItemsByExpenseId,
} from '../expenseItemRepository';
import type { ExpenseItem } from '@budget/shared-types';

function makeItem(overrides: Partial<ExpenseItem> = {}): ExpenseItem {
  const now = new Date('2026-07-24T12:00:00Z');
  return {
    id: 'item-1',
    localId: 'item-1',
    expenseId: 'exp-1',
    description: 'MLEKO ŁACIATE 1L',
    quantity: 1,
    unitPrice: 4.5,
    totalPrice: 4.5,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    syncStatus: 'pending',
    syncVersion: 0,
    ...overrides,
  } as ExpenseItem;
}

describe('expenseItemRepository — canonical_name round-trip', () => {
  beforeEach(() => {
    table.clear();
    mockExecuteSql.mockClear();
  });

  it('insertExpenseItem -> loadItemsByExpenseId preserves canonicalName', async () => {
    await insertExpenseItem(makeItem({ canonicalName: 'Mleko Łaciate 3,2% 1L' }));

    const loaded = await loadItemsByExpenseId('exp-1');

    expect(loaded).toHaveLength(1);
    expect(loaded[0].canonicalName).toBe('Mleko Łaciate 3,2% 1L');
  });

  it('insertExpenseItem -> loadItemsByExpenseId leaves canonicalName undefined for a manual item', async () => {
    await insertExpenseItem(makeItem({ id: 'item-2', canonicalName: undefined }));

    const loaded = await loadItemsByExpenseId('exp-1');

    expect(loaded).toHaveLength(1);
    expect(loaded[0].canonicalName).toBeUndefined();
  });

  it('upsertExpenseItem (server-pull path) preserves canonicalName on first insert and on conflict update', async () => {
    await upsertExpenseItem(makeItem({ id: 'item-3', canonicalName: 'Chleb Wiejski 500g' }));
    let loaded = await loadItemsByExpenseId('exp-1');
    expect(loaded[0].canonicalName).toBe('Chleb Wiejski 500g');

    // Re-upsert the same id with a renamed canonical name (e.g. alias merge on
    // the server) — ON CONFLICT DO UPDATE must overwrite it, not keep the old value.
    await upsertExpenseItem(
      makeItem({ id: 'item-3', canonicalName: 'Chleb Wiejski 0,5kg' }),
    );
    loaded = await loadItemsByExpenseId('exp-1');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].canonicalName).toBe('Chleb Wiejski 0,5kg');
  });

  it('updateExpenseItemInDb can set canonicalName and it round-trips on the next read', async () => {
    await insertExpenseItem(makeItem({ id: 'item-4', canonicalName: undefined }));

    await updateExpenseItemInDb(
      'item-4',
      { canonicalName: 'Jogurt Naturalny 400g' },
      new Date('2026-07-25T00:00:00Z'),
      'pending',
    );

    const loaded = await loadItemsByExpenseId('exp-1');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].canonicalName).toBe('Jogurt Naturalny 400g');
  });
});
