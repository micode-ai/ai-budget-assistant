/**
 * The income tab has the same diverged-category blind spot as the expense tab.
 *
 * `getFilteredIncomes` matched only a falsy `categoryId`, so an income row
 * carrying a category id the device cannot resolve — which every category-
 * showing screen already labels "Bez kategorii" — was unreachable from the
 * filter named after that label (ABA-575).
 *
 * Mock shape follows `incomeStoreUncategorizedFilter.test.ts`.
 */
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

jest.mock('@/db/incomeRepository', () => ({
  loadAllIncomes: jest.fn().mockResolvedValue([]),
  insertIncome: jest.fn().mockResolvedValue(undefined),
  upsertIncome: jest.fn().mockResolvedValue(undefined),
  updateIncomeInDb: jest.fn().mockResolvedValue(undefined),
  softDeleteIncomeInDb: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/tagRepository', () => ({
  insertIncomeTag: jest.fn().mockResolvedValue(undefined),
  getTagsForIncome: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/db/categoryRepository', () => ({
  getCategoryByNameExcludingId: jest.fn().mockResolvedValue(null),
  mergeCategoryInto: jest.fn().mockResolvedValue(undefined),
  getCategoryById: jest.fn().mockResolvedValue(null),
  upsertCategory: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/syncMetadataRepository', () => ({ setLastSyncTime: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/db/client', () => ({ withTransaction: jest.fn((fn: () => Promise<void>) => fn()) }));
jest.mock('@/services/api', () => ({
  api: { getIncomes: jest.fn(), createIncome: jest.fn(), updateIncome: jest.fn() },
}));
jest.mock('@/services/encryptionHelper', () => ({
  maybeEncrypt: jest.fn(async (x: unknown) => x),
  maybeDecrypt: jest.fn(async (x: unknown) => x),
}));
jest.mock('@/stores/accountStore', () => ({
  useAccountStore: { getState: jest.fn(() => ({ currentAccountId: 'acc-1' })) },
}));
jest.mock('@/stores/gamificationStore', () => ({ useGamificationStore: { getState: jest.fn(() => ({})) } }));

const categoryState: { isInitialized: boolean; categories: unknown[]; known: string[] } = {
  isInitialized: true,
  categories: [{ id: 'cat-salary' }],
  known: ['cat-salary'],
};

jest.mock('@/stores/categoryStore', () => ({
  useCategoryStore: {
    getState: jest.fn(() => ({
      loadCategories: jest.fn().mockResolvedValue(undefined),
      isInitialized: categoryState.isInitialized,
      categories: categoryState.categories,
      getCategoryById: (id: string) => (categoryState.known.includes(id) ? { id } : undefined),
    })),
  },
}));

import { useIncomeStore } from '../incomeStore';
import { UNCATEGORIZED_CATEGORY_FILTER } from '../categoryFilter';

const income = (id: string, categoryId?: string) => ({
  id,
  localId: id,
  accountId: 'acc-1',
  amount: 100,
  currencyCode: 'PLN',
  date: new Date(),
  categoryId,
  isDeleted: false,
  syncStatus: 'synced',
  createdAt: new Date(),
  updatedAt: new Date(),
});

const uncategorizedIds = () => {
  useIncomeStore.setState({
    filters: { dateRange: 'all', categoryId: UNCATEGORIZED_CATEGORY_FILTER, searchQuery: '' },
  } as any);
  return useIncomeStore.getState().getFilteredIncomes().map((i) => i.id);
};

describe('incomeStore — without-category filter on a diverged device', () => {
  beforeEach(() => {
    categoryState.isInitialized = true;
    categoryState.categories = [{ id: 'cat-salary' }];
    categoryState.known = ['cat-salary'];
    useIncomeStore.setState({
      incomes: [
        income('resolves', 'cat-salary'),
        income('no-cat'),
        income('diverged', 'server-uuid-the-device-never-saw'),
      ],
    } as any);
  });

  it('finds a row whose category id resolves to nothing', () => {
    expect(uncategorizedIds().sort()).toEqual(['diverged', 'no-cat']);
  });

  it('does not sweep every row in while the category store is still loading', () => {
    categoryState.isInitialized = false;
    categoryState.categories = [];
    categoryState.known = [];

    expect(uncategorizedIds()).toEqual(['no-cat']);
  });
});
