/**
 * ABA-749 — the expense offline retry.
 * - A push marks the row synced only when the server acknowledged it; a transport
 *   failure leaves it pending for the next sync (it used to be marked synced on
 *   any error, so an expense whose create failed never reached the server).
 * - A receipt the server never acknowledged resends its lines.
 * - A delete made offline stays pending in SQLite and is resent until the server
 *   confirms it (or no longer has the expense).
 */
import { syncPendingExpenses, syncPendingExpenseDeletes } from '../expenseSync';
import { api } from '../../services/api';
import * as expenseRepository from '../../db/expenseRepository';
import * as expenseItemRepository from '../../db/expenseItemRepository';

jest.mock('../../db/client', () => ({
  withTransaction: jest.fn((fn: () => Promise<void>) => fn()),
}));

jest.mock('../../db/syncMetadataRepository', () => ({
  setLastSyncTime: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../db/expenseRepository', () => ({
  loadAllExpenses: jest.fn().mockResolvedValue([]),
  upsertExpense: jest.fn().mockResolvedValue(undefined),
  softDeleteExpenseInDb: jest.fn().mockResolvedValue(undefined),
  updateExpenseInDb: jest.fn().mockResolvedValue(undefined),
  setExpenseServerId: jest.fn().mockResolvedValue(undefined),
  getReceiptImageFromDb: jest.fn().mockResolvedValue(null),
  loadPendingExpenseDeleteIds: jest.fn().mockResolvedValue([]),
  markExpenseDeleteSynced: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../db/receiptPartsRepository', () => ({
  getReceiptPartsFromDb: jest.fn().mockResolvedValue([]),
  readReceiptPartsStrict: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../db/expenseItemRepository', () => ({
  loadItemsByExpenseId: jest.fn().mockResolvedValue([]),
  upsertExpenseItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../db/tagRepository', () => ({
  insertExpenseTag: jest.fn().mockResolvedValue(undefined),
  getTagsForExpense: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../db/projectRepository', () => ({
  addExpenseToProject: jest.fn().mockResolvedValue(undefined),
  getProjectIdForExpense: jest.fn().mockResolvedValue(null),
  getAllProjectExpenseMappings: jest.fn().mockResolvedValue([]),
  upsertProject: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../features/receipt/serverSplits', () => ({
  mapServerSplits: jest.fn(),
}));

jest.mock('../../db/splitRepository', () => ({
  getSplitsForExpenses: jest.fn().mockResolvedValue([]),
  replaceSplitsForExpense: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../db/categoryRepository', () => ({
  upsertCategory: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/api', () => ({
  api: {
    createExpense: jest.fn().mockResolvedValue({ id: 'srv-1' }),
    deleteExpense: jest.fn().mockResolvedValue(undefined),
    getExpenses: jest.fn().mockResolvedValue({ data: [] }),
  },
}));

jest.mock('../../services/encryptionHelper', () => ({
  maybeEncrypt: jest.fn((_entityType: string, data: Record<string, unknown>) =>
    Promise.resolve({ payload: data, encryptedPayload: undefined, encryptionKeyVersion: undefined }),
  ),
  maybeDecrypt: jest.fn(),
}));

jest.mock('../../utils/location', () => ({
  parseServerLocation: jest.fn(),
}));

jest.mock('../accountStore', () => ({
  useAccountStore: { getState: () => ({ currentAccountId: 'acc-1' }) },
}));

jest.mock('../categoryStore', () => ({
  useCategoryStore: {
    getState: () => ({
      getCategoryById: (id: string) => (id === 'cat-local' ? { id, name: 'Groceries' } : undefined),
    }),
  },
}));

jest.mock('../projectStore', () => ({
  useProjectStore: { getState: () => ({}) },
}));

const mockApi = api as jest.Mocked<typeof api>;
const repo = expenseRepository as jest.Mocked<typeof expenseRepository>;
const itemRepo = expenseItemRepository as jest.Mocked<typeof expenseItemRepository>;

function makePendingExpense(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'exp-1',
    localId: 'exp-1',
    accountId: 'acc-1',
    amount: 42,
    currencyCode: 'PLN',
    description: 'Groceries',
    date: new Date('2026-01-01T00:00:00.000Z'),
    source: 'ocr',
    syncStatus: 'pending',
    isDeleted: false,
    ...over,
  };
}

function storeWith(expense: ReturnType<typeof makePendingExpense>) {
  let expenses: any[] = [expense];
  const set = jest.fn((fn: (s: any) => any) => {
    expenses = fn({ expenses }).expenses;
  });
  const get = () => ({ expenses, isLoading: false, error: null, lastPullAt: null });
  return { set, get, current: () => expenses[0] };
}

function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  (console.warn as jest.Mock).mockRestore();
});

describe('syncPendingExpenses — only an acknowledged push is synced', () => {
  it('leaves the row pending when the push fails without a response (offline)', async () => {
    mockApi.createExpense.mockRejectedValueOnce(new TypeError('Network request failed'));
    const s = storeWith(makePendingExpense());

    await syncPendingExpenses(s.set as any, s.get as any);

    expect(s.current().syncStatus).toBe('pending');
    expect(repo.updateExpenseInDb).not.toHaveBeenCalledWith('exp-1', {}, expect.any(Date), 'synced');
  });

  it('leaves the row pending on a server error', async () => {
    mockApi.createExpense.mockRejectedValueOnce(httpError(503));
    const s = storeWith(makePendingExpense());

    await syncPendingExpenses(s.set as any, s.get as any);

    expect(s.current().syncStatus).toBe('pending');
  });

  it('lets go of a row the server refuses (4xx), as retrying would not change it', async () => {
    mockApi.createExpense.mockRejectedValueOnce(httpError(400));
    const s = storeWith(makePendingExpense());

    await syncPendingExpenses(s.set as any, s.get as any);

    expect(s.current().syncStatus).toBe('synced');
  });

  it('marks the row synced when the push lands', async () => {
    const s = storeWith(makePendingExpense());

    await syncPendingExpenses(s.set as any, s.get as any);

    expect(s.current().syncStatus).toBe('synced');
    expect(repo.updateExpenseInDb).toHaveBeenCalledWith('exp-1', {}, expect.any(Date), 'synced');
  });
});

describe('syncPendingExpenses — receipt lines on the retry', () => {
  const lines = [
    { id: 'l1', expenseId: 'exp-1', description: 'Milk', quantity: 2, unitPrice: 3, totalPrice: 6, sortOrder: 0, categoryId: 'cat-local', isDeleted: false },
    { id: 'l2', expenseId: 'exp-1', description: 'Gone', quantity: 1, unitPrice: 1, totalPrice: 1, sortOrder: 1, categoryId: null, isDeleted: true },
    { id: 'l3', expenseId: 'exp-1', description: 'Bread', quantity: 1, unitPrice: 4, totalPrice: 4, sortOrder: 2, categoryId: null, isDeleted: false },
  ];

  it('resends the lines of a receipt the server never acknowledged, category by name', async () => {
    itemRepo.loadItemsByExpenseId.mockResolvedValueOnce(lines as any);
    const s = storeWith(makePendingExpense());

    await syncPendingExpenses(s.set as any, s.get as any);

    const sent = (mockApi.createExpense.mock.calls[0][0] as any).items;
    expect(sent).toEqual([
      expect.objectContaining({ description: 'Milk', totalPrice: 6, categoryId: 'Groceries' }),
      expect.objectContaining({ description: 'Bread', totalPrice: 4, categoryId: undefined }),
    ]);
  });

  it('sends no lines for an acknowledged row (an edit retry)', async () => {
    itemRepo.loadItemsByExpenseId.mockResolvedValue(lines as any);
    const s = storeWith(makePendingExpense({ serverId: 'srv-1' }));

    await syncPendingExpenses(s.set as any, s.get as any);

    expect((mockApi.createExpense.mock.calls[0][0] as any).items).toBeUndefined();
    itemRepo.loadItemsByExpenseId.mockResolvedValue([]);
  });
});

describe('syncPendingExpenseDeletes — offline deletes are resent', () => {
  it('marks a delete synced once the server confirms it, and keeps one that failed pending', async () => {
    repo.loadPendingExpenseDeleteIds.mockResolvedValueOnce(['d1', 'd2']);
    mockApi.deleteExpense
      .mockResolvedValueOnce(undefined as any)
      .mockRejectedValueOnce(new TypeError('Network request failed'));

    await syncPendingExpenseDeletes();

    expect(mockApi.deleteExpense).toHaveBeenCalledWith('d1');
    expect(mockApi.deleteExpense).toHaveBeenCalledWith('d2');
    expect(repo.markExpenseDeleteSynced).toHaveBeenCalledWith('d1');
    expect(repo.markExpenseDeleteSynced).not.toHaveBeenCalledWith('d2');
  });

  it('treats a 404 as done: the server no longer has the expense', async () => {
    repo.loadPendingExpenseDeleteIds.mockResolvedValueOnce(['d1']);
    mockApi.deleteExpense.mockRejectedValueOnce(httpError(404));

    await syncPendingExpenseDeletes();

    expect(repo.markExpenseDeleteSynced).toHaveBeenCalledWith('d1');
  });

  it('runs from syncPendingExpenses even when no expense is pending', async () => {
    repo.loadPendingExpenseDeleteIds.mockResolvedValueOnce(['d1']);
    const get = () => ({ expenses: [], isLoading: false, error: null, lastPullAt: null });

    await syncPendingExpenses(jest.fn() as any, get as any);

    expect(mockApi.deleteExpense).toHaveBeenCalledWith('d1');
  });
});
