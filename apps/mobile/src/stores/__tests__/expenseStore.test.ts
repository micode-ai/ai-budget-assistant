import * as tripExpenseShareRepository from '../../db/tripExpenseShareRepository';

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

jest.mock('../categoryStore', () => ({
  useCategoryStore: {
    getState: () => ({ getCategoryById: () => undefined }),
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

import { useExpenseStore } from '../expenseStore';

describe('expenseStore — trip shares', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useExpenseStore.setState({
      expenses: [],
      isLoading: false,
      error: null,
      expenseItems: {},
    } as any);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('persists shares locally when addExpense is called with a splitType and shares', async () => {
    const bulkInsertSpy = jest
      .spyOn(tripExpenseShareRepository, 'bulkInsertShares')
      .mockResolvedValue(undefined);
    const deleteAllSpy = jest
      .spyOn(tripExpenseShareRepository, 'deleteAllSharesForExpense')
      .mockResolvedValue(undefined);

    await useExpenseStore.getState().addExpense({
      amount: 90,
      currencyCode: 'USD',
      date: '2026-08-01',
      source: 'manual',
      splitType: 'equal',
      shares: [
        { userId: 'alice', value: 0 },
        { userId: 'bob', value: 0 },
      ],
    } as any);

    expect(deleteAllSpy).toHaveBeenCalled();
    expect(bulkInsertSpy).toHaveBeenCalled();
    const insertedShares = bulkInsertSpy.mock.calls[0][0];
    expect(insertedShares).toHaveLength(2);
    expect(insertedShares[0]).toMatchObject({ userId: 'alice', shareType: 'equal' });
    expect(insertedShares[1]).toMatchObject({ userId: 'bob', shareType: 'equal' });
  });

  it('does not touch trip share repository when shares are absent (no-op for normal expenses)', async () => {
    const bulkInsertSpy = jest
      .spyOn(tripExpenseShareRepository, 'bulkInsertShares')
      .mockResolvedValue(undefined);
    const deleteAllSpy = jest
      .spyOn(tripExpenseShareRepository, 'deleteAllSharesForExpense')
      .mockResolvedValue(undefined);

    await useExpenseStore.getState().addExpense({
      amount: 50,
      currencyCode: 'USD',
      date: '2026-08-01',
      source: 'manual',
    } as any);

    expect(deleteAllSpy).not.toHaveBeenCalled();
    expect(bulkInsertSpy).not.toHaveBeenCalled();
  });

  it('persists shares locally when updateExpense is called with a splitType and shares', async () => {
    const bulkInsertSpy = jest
      .spyOn(tripExpenseShareRepository, 'bulkInsertShares')
      .mockResolvedValue(undefined);
    const deleteAllSpy = jest
      .spyOn(tripExpenseShareRepository, 'deleteAllSharesForExpense')
      .mockResolvedValue(undefined);

    useExpenseStore.setState({
      expenses: [
        {
          id: 'exp-1',
          localId: 'exp-1',
          accountId: 'acc-1',
          userId: 'user-1',
          amount: 90,
          currencyCode: 'USD',
          date: new Date('2026-08-01'),
          source: 'manual',
          isRecurring: false,
          isDebt: false,
          isDebtRepayment: false,
          createdAt: new Date('2026-08-01'),
          updatedAt: new Date('2026-08-01'),
          isDeleted: false,
          syncStatus: 'synced',
          syncVersion: 0,
        },
      ],
    } as any);

    useExpenseStore.getState().updateExpense('exp-1', {
      splitType: 'equal',
      shares: [
        { userId: 'alice', value: 0 },
        { userId: 'bob', value: 0 },
      ],
    } as any);

    // The trip-share writes are chained off async SQLite calls (deleteAllSharesForExpense
    // .then(bulkInsertShares)); flush the microtask queue so both resolve.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(deleteAllSpy).toHaveBeenCalledWith('exp-1');
    expect(bulkInsertSpy).toHaveBeenCalled();
    const insertedShares = bulkInsertSpy.mock.calls[0][0];
    expect(insertedShares).toHaveLength(2);
    expect(insertedShares[0]).toMatchObject({ userId: 'alice', shareType: 'equal' });
    expect(insertedShares[1]).toMatchObject({ userId: 'bob', shareType: 'equal' });
  });
});
