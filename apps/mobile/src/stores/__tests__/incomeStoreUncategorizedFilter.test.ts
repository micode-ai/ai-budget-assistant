/**
 * The "Without category" filter works on the income tab too.
 *
 * ABA-562 added the option to the shared picker but gated both the row and the
 * filtering to the expense tab, so income had no way to reach the entries still
 * waiting to be sorted. Requested by a user in the same breath as the delete
 * guard: "the same filter would be useful in incomes too" (ABA-567).
 *
 * Mock shape follows `incomeStoreLastPullAt.test.ts`.
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
// A healthy device: loaded, and every `cat-*` id below resolves. The full
// shape matters — `getFilteredIncomes` reads `isInitialized` and `categories`
// as well, to tell a genuinely uncategorized row apart from one whose category
// this device cannot resolve (ABA-575).
jest.mock('@/stores/categoryStore', () => ({
  useCategoryStore: {
    getState: jest.fn(() => ({
      loadCategories: jest.fn().mockResolvedValue(undefined),
      isInitialized: true,
      categories: [{ id: 'cat-salary' }, { id: 'cat-bonus' }],
      getCategoryById: (id: string) => (id.startsWith('cat-') ? { id } : undefined),
    })),
  },
}));
jest.mock('@/stores/gamificationStore', () => ({ useGamificationStore: { getState: jest.fn(() => ({})) } }));

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

const ALL = [
  income('with-cat', 'cat-salary'),
  income('no-cat'),
  income('empty-cat', ''),
  income('other-cat', 'cat-bonus'),
];

beforeEach(() => {
  useIncomeStore.getState().reset();
  useIncomeStore.setState({ incomes: ALL as any });
});

describe('incomeStore.getFilteredIncomes — without-category filter', () => {
  const filterBy = (categoryId: string | null) => {
    useIncomeStore.setState({
      filters: { dateRange: 'all', categoryId, searchQuery: '' } as any,
    });
    return useIncomeStore.getState().getFilteredIncomes().map((i) => i.id);
  };

  it('returns only the incomes with no category', () => {
    // An empty string counts as "no category" for the same reason it does on
    // the expense side: the check is falsiness, not `=== undefined`.
    expect(filterBy(UNCATEGORIZED_CATEGORY_FILTER).sort()).toEqual(['empty-cat', 'no-cat']);
  });

  it('still filters by a real category id', () => {
    expect(filterBy('cat-salary')).toEqual(['with-cat']);
  });

  it('returns everything when no category filter is set', () => {
    expect(filterBy(null)).toHaveLength(4);
  });

  it('never treats the sentinel as a real id', () => {
    // If the sentinel ever leaked into an equality match it would return
    // nothing at all, which is exactly what the user reported on the expense
    // tab: the option is there and filters nothing.
    expect(filterBy(UNCATEGORIZED_CATEGORY_FILTER)).not.toHaveLength(0);
  });
});
