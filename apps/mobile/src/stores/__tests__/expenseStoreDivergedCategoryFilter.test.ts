
// Manual factory (not bare automock): automocking still `require()`s the real
// module to infer its shape, which would pull in `./client` -> expo-sqlite's
// native `openDatabaseSync` and crash outside a real app runtime.
jest.mock('../../db/tripExpenseShareRepository', () => ({
  insertShare: jest.fn().mockResolvedValue(undefined),
  bulkInsertShares: jest.fn().mockResolvedValue(undefined),
  getSharesForExpense: jest.fn().mockResolvedValue([]),
  deleteAllSharesForExpense: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../db/expenseRepository', () => ({
  insertExpense: jest.fn().mockResolvedValue(undefined),
  updateExpenseInDb: jest.fn().mockResolvedValue(undefined),
  softDeleteExpenseInDb: jest.fn().mockResolvedValue(undefined),
  saveReceiptImageLocally: jest.fn().mockResolvedValue(undefined),
  getReceiptImageFromDb: jest.fn().mockResolvedValue(null),
  deleteReceiptImageLocally: jest.fn().mockResolvedValue(undefined),
  bulkRenameMerchant: jest.fn().mockResolvedValue(undefined),
  bulkMergeMerchants: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../db/expenseItemRepository', () => ({
  loadItemsByExpenseId: jest.fn().mockResolvedValue([]),
  insertExpenseItems: jest.fn().mockResolvedValue(undefined),
  insertExpenseItem: jest.fn().mockResolvedValue(undefined),
  upsertExpenseItem: jest.fn().mockResolvedValue(undefined),
  updateExpenseItemInDb: jest.fn().mockResolvedValue(undefined),
  softDeleteExpenseItemInDb: jest.fn().mockResolvedValue(undefined),
  deduplicateItemsByExpenseId: jest.fn().mockResolvedValue(undefined),
  replaceItemsForExpense: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../db/tagRepository', () => ({
  insertExpenseTag: jest.fn().mockResolvedValue(undefined),
  getTagsForExpense: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../db/projectRepository', () => ({
  addExpenseToProject: jest.fn().mockResolvedValue(undefined),
  removeExpenseFromProject: jest.fn().mockResolvedValue(undefined),
  getProjectIdForExpense: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../services/api', () => ({
  api: {
    createExpense: jest.fn().mockResolvedValue({}),
    updateExpense: jest.fn().mockResolvedValue({}),
    deleteExpense: jest.fn().mockResolvedValue({}),
    bulkUpdateExpenses: jest.fn().mockResolvedValue({}),
    getExpenseItems: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../services/encryptionHelper', () => ({
  maybeEncrypt: jest.fn((_entityType: string, data: Record<string, unknown>) =>
    Promise.resolve({ payload: data }),
  ),
}));

jest.mock('../../utils/merchant', () => ({
  getDistinctMerchants: jest.fn(() => []),
  getMerchantCounts: jest.fn(() => []),
}));

jest.mock('../expenseSync', () => ({
  pullAndMergeExpenses: jest.fn().mockResolvedValue(undefined),
  syncPendingExpenses: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../accountStore', () => ({
  useAccountStore: {
    getState: () => ({ currentAccountId: 'acc-1', canEdit: () => true }),
  },
}));


jest.mock('../gamificationStore', () => ({
  useGamificationStore: {
    getState: () => ({ checkAchievements: () => {} }),
  },
}));

jest.mock('../../i18n', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

// expenseStore registers a `useExpenseStore.subscribe` listener at module
// load that debounces a `require('@/services/widgetData')` call via
// `setTimeout` on every `expenses` change. Mock it so that deferred timer
// (which can fire after this test file's Jest environment tears down)
// doesn't throw `refreshWidgetData is not a function`.
jest.mock('../../services/widgetData', () => ({
  refreshWidgetData: jest.fn(),
}));

// Configurable: these tests turn the category store from "still loading" into
// "loaded, and this id is not one of mine", which is the state a diverged
// device is permanently in.
const categoryState: { isInitialized: boolean; categories: unknown[]; known: string[] } = {
  isInitialized: true,
  categories: [{ id: 'cat-1' }],
  known: ['cat-1'],
};

jest.mock('../categoryStore', () => ({
  useCategoryStore: {
    getState: () => ({
      isInitialized: categoryState.isInitialized,
      categories: categoryState.categories,
      getCategoryById: (id: string) => (categoryState.known.includes(id) ? { id } : undefined),
    }),
  },
}));

import { useExpenseStore, UNCATEGORIZED_CATEGORY_FILTER } from '../expenseStore';
import type { Expense } from '@budget/shared-types';

const expense = (id: string, categoryId: string | null): Expense =>
  ({
    id,
    amount: 10,
    categoryId,
    date: new Date('2026-09-15T12:00:00Z'),
    isDeleted: false,
    merchant: null,
    description: null,
    notes: null,
  }) as unknown as Expense;

const uncategorizedIds = () => {
  useExpenseStore.setState({
    filters: { dateRange: 'all', categoryId: UNCATEGORIZED_CATEGORY_FILTER, merchants: [], searchQuery: '' },
  } as any);
  return useExpenseStore.getState().getFilteredExpenses().map((e) => e.id);
};

/**
 * The reported bug (ABA-575): every imported expense read "Bez kategorii" on
 * its detail screen while the "without category" filter returned nothing.
 * Those rows carried the SERVER's category id, which the device could not
 * resolve to any local category — so the screen fell back to the uncategorized
 * label and the filter, matching only a falsy id, skipped every one of them.
 */
describe('expenseStore — without-category filter on a diverged device', () => {
  beforeEach(() => {
    categoryState.isInitialized = true;
    categoryState.categories = [{ id: 'cat-1' }];
    categoryState.known = ['cat-1'];
    useExpenseStore.setState({
      expenses: [
        expense('resolves', 'cat-1'),
        expense('no-cat', null),
        expense('diverged', 'server-uuid-the-device-never-saw'),
      ],
    } as any);
  });

  it('finds a row whose category id resolves to nothing', () => {
    expect(uncategorizedIds().sort()).toEqual(['diverged', 'no-cat']);
  });

  it('still excludes a row whose category resolves', () => {
    expect(uncategorizedIds()).not.toContain('resolves');
  });

  it('does not sweep every row in while the category store is still loading', () => {
    categoryState.isInitialized = false;
    categoryState.categories = [];
    categoryState.known = [];

    expect(uncategorizedIds()).toEqual(['no-cat']);
  });
});
