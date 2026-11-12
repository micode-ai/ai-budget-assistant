/**
 * Child costs on native: a receipt line's own discount and category round-trip
 * through SQLite, and a line-attributed expense yields the same child total on
 * the device as from the server's lines (what the web and the statement use).
 *
 * Mock boundary is `../client`, as in `expenseItemRepository.test.ts`: a tiny
 * in-memory table that runs the repository's real INSERT / UPSERT / UPDATE /
 * SELECT strings.
 */
import type { Expense, ExpenseItem } from '@budget/shared-types';

type Row = Record<string, string | number | null>;
const table = new Map<string, Row>();

const mockExecuteSql = jest.fn(async (sql: string, params: (string | number | null)[] = []) => {
  const s = sql.trim();
  if (s.startsWith('INSERT INTO expense_items')) {
    const cols = s.match(/INSERT INTO expense_items \(([^)]+)\)/i)![1].split(',').map((c) => c.trim());
    const row: Row = {};
    cols.forEach((c, i) => (row[c] = params[i]));
    const existing = table.get(String(row.id));
    if (existing && /ON CONFLICT/.test(s)) {
      // Mirror the upsert's update list for the columns under test.
      existing.line_discount = row.line_discount;
      existing.category_id = row.category_id;
      existing.total_price = row.total_price;
    } else {
      table.set(String(row.id), row);
    }
    return [];
  }
  if (s.startsWith('UPDATE expense_items SET line_discount')) {
    const [lineDiscount, categoryId, id] = params;
    const row = table.get(String(id));
    if (row) {
      row.line_discount = lineDiscount;
      row.category_id = categoryId;
    }
    return [];
  }
  if (s.startsWith('UPDATE expense_items SET id = ?')) {
    const [newId, localId, oldId] = params;
    const row = table.get(String(oldId));
    if (row) {
      table.delete(String(oldId));
      Object.assign(row, { id: newId, local_id: localId, server_known: 1, sync_status: 'synced' });
      table.set(String(newId), row);
    }
    return [];
  }
  if (s.startsWith('SELECT id FROM expense_items WHERE id = ?')) {
    return table.has(String(params[0])) ? [{ id: params[0] }] : [];
  }
  if (s.startsWith('DELETE FROM expense_items WHERE id = ?')) {
    table.delete(String(params[0]));
    return [];
  }
  if (s.startsWith('SELECT * FROM expense_items WHERE expense_id')) {
    return [...table.values()].filter((r) => r.expense_id === params[0] && r.is_deleted === 0);
  }
  if (s.startsWith('SELECT ei.* FROM expense_items ei')) {
    const attributed = new Set(
      [...table.values()].filter((r) => r.child_id && r.is_deleted === 0).map((r) => r.expense_id),
    );
    return [...table.values()].filter((r) => attributed.has(r.expense_id) && r.is_deleted === 0);
  }
  return [];
});

jest.mock('../client', () => ({
  executeSql: (...args: [string, (string | number | null)[]?]) => mockExecuteSql(...args),
  withTransaction: async (fn: () => Promise<unknown>) => fn(),
}));

// eslint-disable-next-line import/first
import { childCostSummary } from '@budget/shared-utils';
// eslint-disable-next-line import/first
import {
  adoptServerItemId,
  getChildLineItems,
  insertExpenseItem,
  loadItemsByExpenseId,
  setExpenseItemDetails,
  upsertExpenseItem,
} from '../expenseItemRepository';
// eslint-disable-next-line import/first
import { mapServerChildLines } from '@/stores/childSync';
// eslint-disable-next-line import/first
import { computeChildCosts, makeConverter, toAttributionInput } from '@/features/children/childCosts';

const NOW = new Date(2026, 10, 12);

const line = (over: Partial<ExpenseItem>): ExpenseItem => ({
  id: 'l1',
  localId: 'l1',
  expenseId: 'e1',
  description: 'Pieluchy',
  quantity: 1,
  unitPrice: 50,
  totalPrice: 50,
  sortOrder: 0,
  isDeleted: false,
  syncStatus: 'synced',
  syncVersion: 0,
  createdAt: NOW,
  updatedAt: NOW,
  childId: null,
  ...over,
});

const expense = {
  id: 'e1',
  localId: 'e1',
  amount: 90,
  discountAmount: 0,
  currencyCode: 'PLN',
  categoryId: 'food',
  date: new Date(2026, 10, 3),
  isDeleted: false,
  expenseChildren: [],
} as unknown as Expense;

// The server's view of the same receipt: a 10 PLN discount printed on the attributed line.
const serverItems = [
  { id: 'l1', description: 'Pieluchy', totalPrice: '50', lineDiscount: '10', categoryId: 'baby', childId: 'kidA' },
  { id: 'l2', description: 'Chleb', totalPrice: '50', lineDiscount: '0', categoryId: 'food', childId: null },
];

beforeEach(() => table.clear());

describe('expense_items line_discount / category_id', () => {
  it('round-trips through insert and read', async () => {
    await insertExpenseItem(line({ lineDiscount: 10, categoryId: 'baby' }));
    const [read] = await loadItemsByExpenseId('e1');
    expect(read.lineDiscount).toBe(10);
    expect(read.categoryId).toBe('baby');
  });

  it('a row written before the columns existed reads as null, never undefined-as-zero confusion', async () => {
    await insertExpenseItem(line({}));
    const [read] = await loadItemsByExpenseId('e1');
    expect(read.lineDiscount).toBeNull();
    expect(read.categoryId).toBeNull();
  });

  it('setExpenseItemDetails backfills an existing line from server data', async () => {
    await insertExpenseItem(line({ childId: 'kidA' }));
    await setExpenseItemDetails([{ id: 'l1', lineDiscount: 10, categoryId: 'baby' }]);
    const [read] = await loadItemsByExpenseId('e1');
    expect(read).toEqual(expect.objectContaining({ lineDiscount: 10, categoryId: 'baby', childId: 'kidA' }));
  });

  it('a native line with a lineDiscount yields the same child total as the web/core computation', async () => {
    // Native: the pull writes the server's lines (with their discount) into SQLite.
    await upsertExpenseItem(line({ id: 'l1', totalPrice: 50, lineDiscount: 10, categoryId: 'baby', childId: 'kidA' }));
    await upsertExpenseItem(line({ id: 'l2', description: 'Chleb', totalPrice: 50, lineDiscount: 0, categoryId: 'food', sortOrder: 1 }));
    const nativeLines = await getChildLineItems('acc1');

    // Web: the same lines straight from the list pull.
    const webLines = mapServerChildLines('e1', serverItems, new Map([['kidA', 'kidA']]))!;

    const sources = (lines: ExpenseItem[]) => ({
      expenses: [expense],
      incomes: [],
      lines,
      rates: { PLN: 1 },
      displayCurrency: 'PLN',
      now: NOW,
    });
    const native = computeChildCosts('kidA', sources(nativeLines)).summary;
    const web = computeChildCosts('kidA', sources(webLines)).summary;
    const core = childCostSummary({
      childId: 'kidA',
      ...toAttributionInput([expense], webLines),
      convert: makeConverter({ PLN: 1 }, 'PLN'),
      now: NOW,
    });

    expect(native.monthTotal).toBe(40); // 50 - 10 line discount
    expect(native).toEqual(web);
    expect(native).toEqual(core);
    expect(native.byCategory).toEqual([{ categoryId: 'baby', amount: 40 }]);
  });

  it('a line created on the device carries no OCR discount, so its total matches the server (R13)', async () => {
    // The scan read a 10 PLN line discount, but the create request never sends it:
    // the server's line has none. The device row is written with null (expenseStore),
    // so the device, the web and the statement agree before and after adoption.
    await insertExpenseItem(line({ id: 'l1', totalPrice: 50, lineDiscount: null, childId: 'kidA', syncStatus: 'pending' }));
    await insertExpenseItem(line({ id: 'l2', description: 'Chleb', totalPrice: 50, sortOrder: 1, syncStatus: 'pending' }));
    const deviceLines = await getChildLineItems('acc1');
    const serverAfterCreate = serverItems.map((it) => ({ ...it, lineDiscount: null }));
    const webLines = mapServerChildLines('e1', serverAfterCreate, new Map([['kidA', 'kidA']]))!;

    const sources = (lines: ExpenseItem[]) => ({
      expenses: [expense],
      incomes: [],
      lines,
      rates: { PLN: 1 },
      displayCurrency: 'PLN',
      now: NOW,
    });
    const device = computeChildCosts('kidA', sources(deviceLines)).summary;
    const web = computeChildCosts('kidA', sources(webLines)).summary;
    expect(device.monthTotal).toBe(web.monthTotal);
  });
});

describe('adoptServerItemId (a hand-added line pushed, R12c)', () => {
  it('re-keys the local row to the server id, marks it server-known and keeps its child', async () => {
    await insertExpenseItem(line({ id: 'local-x', localId: 'local-x', childId: 'kidA', syncStatus: 'pending' }));
    expect(table.get('local-x')!.server_known).toBe(0);

    await adoptServerItemId('e1', 'local-x', 'srv-x');

    expect(table.has('local-x')).toBe(false);
    expect(table.get('srv-x')).toEqual(
      expect.objectContaining({ id: 'srv-x', local_id: 'srv-x', server_known: 1, sync_status: 'synced', child_id: 'kidA' }),
    );
  });

  it('when the server row is already there, drops the local duplicate', async () => {
    await insertExpenseItem(line({ id: 'local-x', localId: 'local-x', syncStatus: 'pending' }));
    await insertExpenseItem(line({ id: 'srv-x', localId: 'srv-x', syncStatus: 'synced' }));

    await adoptServerItemId('e1', 'local-x', 'srv-x');

    expect(table.has('local-x')).toBe(false);
    expect(table.get('srv-x')!.server_known).toBe(1);
  });
});
