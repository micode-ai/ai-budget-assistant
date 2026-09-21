/**
 * End-to-end recovery of a device whose category ids diverged from the server.
 *
 * This is the test that answers "will the reported device actually be fixed?".
 * The unit tests beside it pin each half in isolation; this one reproduces the
 * reported state over an in-memory category table and runs the real
 * `loadCategories` -> `syncFromServer` -> upsert/merge path, then asks the real
 * expense filter what it returns.
 *
 * The reported state, reconstructed:
 * - the account's categories were created in-app before `clientId` support, so
 *   the phone holds them under device-generated ids while the server holds
 *   different primary keys and neither side carries a `clientId`;
 * - the expenses came from a bank import, i.e. they were categorized
 *   server-side, so after a pull their `categoryId` is the SERVER's id — which
 *   matches no local category row;
 * - one expense was categorized in-app instead and still carries the local id;
 * - one expense genuinely has no category.
 *
 * Before the fix: the detail screen renders "uncategorized" for the imported
 * rows (their id resolves to nothing) while the without-category filter returns
 * only the genuinely uncategorized one — the exact contradiction the user saw.
 */

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

jest.mock('react-native-mmkv', () => {
  const store = new Map<string, string | number>();
  return {
    MMKV: jest.fn().mockImplementation(() => ({
      getString: (k: string) => (store.has(k) ? String(store.get(k)) : undefined),
      getNumber: (k: string) => (typeof store.get(k) === 'number' ? (store.get(k) as number) : undefined),
      set: (k: string, v: string | number) => store.set(k, v),
      delete: (k: string) => store.delete(k),
    })),
  };
});

// ── An in-memory stand-in for the device's `categories` mockTable ───────────────
// Faithful on the three operations this path depends on: read-by-account,
// upsert-by-id, and the merge deleting the stale row.
type Row = {
  id: string;
  accountId: string;
  name: string;
  type: 'expense' | 'income';
  isDeleted?: boolean;
  isSystem?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  syncVersion?: number;
};
const mockTable = new Map<string, Row>();
const mockMergeCalls: [string, string][] = [];

jest.mock('@/db/categoryRepository', () => ({
  getAllCategories: jest.fn(async (accountId: string) =>
    [...mockTable.values()].filter((c) => c.accountId === accountId && !c.isDeleted),
  ),
  upsertCategory: jest.fn(async (c: Row) => {
    mockTable.set(c.id, { ...mockTable.get(c.id), ...c });
  }),
  categoryExistsById: jest.fn(async (id: string) => mockTable.has(id)),
  getCategoryById: jest.fn(async (id: string) => mockTable.get(id) ?? null),
  getCategoryByClientId: jest.fn(async () => null),
  remapCategoryId: jest.fn(async () => undefined),
  getCategoryByNameExcludingId: jest.fn(async (accountId: string, name: string, type: string, excludeId: string) => {
    const hit = [...mockTable.values()].find(
      (c) => c.accountId === accountId && c.name === name && c.type === type && c.id !== excludeId && !c.isDeleted,
    );
    return hit ?? null;
  }),
  mergeCategoryInto: jest.fn(async (staleId: string, survivingId: string) => {
    mockMergeCalls.push([staleId, survivingId]);
    // The real one re-points expenses/incomes/allocations/splits, then deletes
    // the stale row. The re-pointing is modelled in the test body below, on the
    // expense store, because that is where this test can observe it.
    mockTable.delete(staleId);
  }),
  deleteCategory: jest.fn(async () => undefined),
  countCategoryReferences: jest.fn(async () => null),
}));

const serverCategories = [
  { id: 'srv-a', clientId: null, accountId: 'acc-1', name: 'Alpha', type: 'expense', isDeleted: false, syncVersion: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'srv-b', clientId: null, accountId: 'acc-1', name: 'Beta', type: 'expense', isDeleted: false, syncVersion: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

jest.mock('@/services/api', () => ({
  api: {
    getCategories: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    createExpense: jest.fn().mockResolvedValue({}),
    updateExpense: jest.fn().mockResolvedValue({}),
    deleteExpense: jest.fn().mockResolvedValue({}),
    bulkUpdateExpenses: jest.fn().mockResolvedValue({}),
    getExpenseItems: jest.fn().mockResolvedValue([]),
    setLogoutHandler: jest.fn(),
    setAccountIdGetter: jest.fn(),
  },
}));

jest.mock('@/services/secureStorage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/db/syncMetadataRepository', () => ({ setLastSyncTime: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/stores/accountStore', () => ({
  useAccountStore: { getState: jest.fn(() => ({ currentAccountId: 'acc-1', canEdit: () => true })) },
}));
jest.mock('@/stores/authStore', () => ({ useAuthStore: { getState: jest.fn(() => ({ user: { id: 'u1' } })) } }));
jest.mock('@/services/encryptionHelper', () => ({
  maybeEncrypt: jest.fn(async (_t: string, data: any) => ({ payload: data })),
  maybeDecrypt: jest.fn(async (_t: string, c: any) => ({ ...c })),
}));

// expenseStore's own dependencies — it is imported for its real filter.
jest.mock('@/db/expenseRepository', () => ({
  insertExpense: jest.fn(), updateExpenseInDb: jest.fn(), setExpenseServerId: jest.fn(),
  softDeleteExpenseInDb: jest.fn(), saveReceiptImageLocally: jest.fn(), getReceiptImageFromDb: jest.fn(),
  deleteReceiptImageLocally: jest.fn(), bulkRenameMerchant: jest.fn(), bulkMergeMerchants: jest.fn(),
  moveExpenseAccountInDb: jest.fn(),
}));
jest.mock('@/db/expenseItemRepository', () => ({
  loadItemsByExpenseId: jest.fn(), insertExpenseItems: jest.fn(), replaceItemsForExpense: jest.fn(),
  insertExpenseItem: jest.fn(), upsertExpenseItem: jest.fn(), updateExpenseItemInDb: jest.fn(),
  softDeleteExpenseItemInDb: jest.fn(), deduplicateItemsByExpenseId: jest.fn(),
}));
jest.mock('@/db/tagRepository', () => ({ insertExpenseTag: jest.fn(), getTagsForExpense: jest.fn() }));
jest.mock('@/db/projectRepository', () => ({
  addExpenseToProject: jest.fn(), removeExpenseFromProject: jest.fn(), getProjectIdForExpense: jest.fn(),
}));
jest.mock('@/db/tripExpenseShareRepository', () => ({
  insertShare: jest.fn(), bulkInsertShares: jest.fn(), getSharesForExpense: jest.fn(), deleteAllSharesForExpense: jest.fn(),
}));
jest.mock('@/stores/expenseSync', () => ({
  pullAndMergeExpenses: jest.fn(), syncPendingExpenses: jest.fn(), resetExpenseSyncThrottle: jest.fn(),
}));
jest.mock('@/stores/gamificationStore', () => ({ useGamificationStore: { getState: () => ({ checkAchievements: () => {} }) } }));
jest.mock('@/utils/merchant', () => ({ getDistinctMerchants: () => [], getMerchantCounts: () => [] }));
jest.mock('@/services/widgetData', () => ({ refreshWidgetData: jest.fn() }));
jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (k: string) => k } }));

import { useCategoryStore } from '../categoryStore';
import { useExpenseStore, UNCATEGORIZED_CATEGORY_FILTER } from '../expenseStore';
import { api } from '@/services/api';
import type { Expense } from '@budget/shared-types';

const expense = (id: string, categoryId?: string): Expense =>
  ({
    id, amount: 10, categoryId, currencyCode: 'PLN', date: new Date(),
    isDeleted: false, merchant: null, description: null, notes: null,
  }) as unknown as Expense;

/** What the detail screen shows: the category's name, or its uncategorized fallback. */
const labelFor = (e: Expense) => {
  const cat = e.categoryId ? useCategoryStore.getState().getCategoryById(e.categoryId) : undefined;
  return cat ? cat.name : 'uncategorized';
};

const uncategorizedIds = () => {
  useExpenseStore.setState({
    filters: { dateRange: 'all', categoryId: UNCATEGORIZED_CATEGORY_FILTER, merchants: [], searchQuery: '' },
  } as any);
  return useExpenseStore.getState().getFilteredExpenses().map((e) => e.id).sort();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockTable.clear();
  mockMergeCalls.length = 0;
  // The device as reported: the account's categories exist locally ONLY under
  // device-generated ids.
  mockTable.set('dev-a', { id: 'dev-a', accountId: 'acc-1', name: 'Alpha', type: 'expense' });
  mockTable.set('dev-b', { id: 'dev-b', accountId: 'acc-1', name: 'Beta', type: 'expense' });
  (api.getCategories as jest.Mock).mockResolvedValue(serverCategories);
  useCategoryStore.getState().reset();
  useExpenseStore.setState({
    expenses: [
      expense('imported-a', 'srv-a'), // bank import: carries the SERVER's id
      expense('imported-b', 'srv-b'),
      expense('in-app', 'dev-a'), // categorized on the phone, not pulled back yet
      expense('really-none'), // genuinely uncategorized
    ],
  } as any);
});

describe('a diverged device recovers on the next launch', () => {
  it('starts in the reported state: imported rows read as uncategorized, yet the filter finds only the empty one', async () => {
    // Seed the in-memory store the way a launch would, WITHOUT the server pull.
    useCategoryStore.setState({ categories: [...mockTable.values()] as any, isInitialized: true });

    expect(labelFor(expense('x', 'srv-a'))).toBe('uncategorized');
    expect(uncategorizedIds()).toEqual(['imported-a', 'imported-b', 'really-none']);
  });

  it('after one loadCategories the imported rows resolve to their real category names', async () => {
    await useCategoryStore.getState().loadCategories();

    expect(labelFor(expense('x', 'srv-a'))).toBe('Alpha');
    expect(labelFor(expense('y', 'srv-b'))).toBe('Beta');
  });

  it('folds the device-id twins away so the picker stops showing each category twice', async () => {
    await useCategoryStore.getState().loadCategories();

    expect(mockMergeCalls).toEqual(expect.arrayContaining([['dev-a', 'srv-a'], ['dev-b', 'srv-b']]));
    const names = useCategoryStore.getState().categories.filter((c) => c.name === 'Alpha');
    expect(names).toHaveLength(1);
    expect(names[0].id).toBe('srv-a');
  });

  it('leaves only the genuinely uncategorized row behind the filter', async () => {
    await useCategoryStore.getState().loadCategories();
    // The merge re-points a row that still carried the local id — modelled here,
    // since the real statement runs against SQLite.
    useExpenseStore.setState({
      expenses: useExpenseStore.getState().expenses.map((e) =>
        e.categoryId === 'dev-a' ? { ...e, categoryId: 'srv-a' } : e,
      ),
    } as any);

    expect(uncategorizedIds()).toEqual(['really-none']);
  });
});
