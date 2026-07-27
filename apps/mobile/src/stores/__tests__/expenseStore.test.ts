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

import { useExpenseStore, computeExpenseTotalsByCurrency } from '../expenseStore';
import type { Expense } from '@budget/shared-types';
import { api } from '../../services/api';
import { loadItemsByExpenseId, upsertExpenseItem } from '../../db/expenseItemRepository';

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

describe('computeExpenseTotalsByCurrency — split-receivable exclusion', () => {
  // Dated "now" so every row falls inside the function's this-month window —
  // computeExpenseTotalsByCurrency always aggregates the current calendar month.
  const now = new Date().toISOString();

  function expense(over: Record<string, unknown> = {}): Expense {
    return {
      id: 'e',
      localId: 'e',
      userId: 'u1',
      accountId: 'acc-1',
      amount: 0,
      currencyCode: 'PLN',
      date: new Date(now),
      isRecurring: false,
      source: 'manual',
      isDebt: false,
      isDebtRepayment: false,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      isDeleted: false,
      syncStatus: 'synced',
      syncVersion: 0,
      ...over,
    } as Expense;
  }

  it('counts a 200 bill split three ways once, not 350', () => {
    const totals = computeExpenseTotalsByCurrency([
      expense({ id: 'receipt', amount: 200 }),
      expense({ id: 'd1', amount: 50, isDebt: true, isSplitReceivable: true }),
      expense({ id: 'd2', amount: 50, isDebt: true, isSplitReceivable: true }),
      expense({ id: 'd3', amount: 50, isDebt: true, isSplitReceivable: true }),
    ]);

    expect(totals.PLN).toBe(200);
  });

  it('still counts a standalone cash loan — that debt row is the real outflow', () => {
    // Only `isSplitReceivable` may be excluded. Filtering on `isDebt` would erase
    // the spending of every user who lends money without splitting a receipt.
    const totals = computeExpenseTotalsByCurrency([
      expense({ amount: 500, isDebt: true, debtContactName: 'Anna' }),
    ]);
    expect(totals.PLN).toBe(500);
  });

  it('treats an absent isSplitReceivable as false (nullable column on pre-existing rows)', () => {
    const totals = computeExpenseTotalsByCurrency([
      expense({ amount: 40, isSplitReceivable: undefined }),
    ]);
    expect(totals.PLN).toBe(40);
  });
});

describe('expenseStore — addExpense carries the OCR canonicalName to the server', () => {
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

  // addExpense awaits the local SQLite writes but fires the encrypt+createExpense
  // call as a detached promise chain ("Fire-and-forget server sync" in
  // expenseStore.ts) — flush the microtask queue so it has actually run by the
  // time we inspect the mock, same pattern as the updateExpense trip-share test
  // above.
  async function flushMicrotasks() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  it('includes canonicalName in the wire payload when the scanned item had one', async () => {
    await useExpenseStore.getState().addExpense({
      amount: 12.5,
      currencyCode: 'PLN',
      date: '2026-07-24',
      source: 'ocr',
      items: [
        { description: 'MLEKO ŁACIATE 1L', canonicalName: 'Mleko Łaciate 3,2% 1L', quantity: 1, unitPrice: 4.5, totalPrice: 4.5 },
      ],
    } as any);

    await flushMicrotasks();

    expect(api.createExpense).toHaveBeenCalled();
    const sentPayload = (api.createExpense as jest.Mock).mock.calls[0][0];
    expect(sentPayload.items).toHaveLength(1);
    expect(sentPayload.items[0]).toMatchObject({
      description: 'MLEKO ŁACIATE 1L',
      canonicalName: 'Mleko Łaciate 3,2% 1L',
    });
  });

  it('omits canonicalName cleanly when the item had none (manually-added item)', async () => {
    await useExpenseStore.getState().addExpense({
      amount: 9,
      currencyCode: 'PLN',
      date: '2026-07-24',
      source: 'manual',
      items: [
        { description: 'Hand-typed item', quantity: 1, unitPrice: 9, totalPrice: 9 },
      ],
    } as any);

    await flushMicrotasks();

    expect(api.createExpense).toHaveBeenCalled();
    const sentPayload = (api.createExpense as jest.Mock).mock.calls[0][0];
    expect(sentPayload.items).toHaveLength(1);
    expect(sentPayload.items[0].canonicalName).toBeUndefined();
    expect(sentPayload.items[0].description).toBe('Hand-typed item');
  });
});

describe('expenseStore — loadExpenseItems server-fetch mapper preserves canonicalName', () => {
  beforeEach(() => {
    // setState triggers the store's `expenses` subscribe listener, which
    // debounces a refreshWidgetData() call via a real setTimeout — fake timers
    // + the afterEach flush below keep that from firing after Jest tears down
    // the environment (same reasoning as the "trip shares" describe above).
    jest.useFakeTimers();
    useExpenseStore.setState({
      expenses: [],
      isLoading: false,
      error: null,
      expenseItems: {},
    } as any);
    jest.clearAllMocks();
    // Falls through to the server fetch only when there is nothing local yet.
    (loadItemsByExpenseId as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('carries canonicalName from the API response into the returned items and the local cache', async () => {
    (api.getExpenseItems as jest.Mock).mockResolvedValue([
      {
        id: 'server-item-1',
        description: 'MLEKO ŁACIATE 1L',
        canonicalName: 'Mleko Łaciate 3,2% 1L',
        quantity: 1,
        unitPrice: 4.5,
        totalPrice: 4.5,
        sortOrder: 0,
        isDeleted: false,
        syncVersion: 0,
      },
    ]);

    const items = await useExpenseStore.getState().loadExpenseItems('exp-1');

    expect(items).toHaveLength(1);
    expect(items[0].canonicalName).toBe('Mleko Łaciate 3,2% 1L');

    // It must also be what gets persisted back into local SQLite, or the value
    // is lost again the next time this expense is opened offline.
    expect(upsertExpenseItem).toHaveBeenCalled();
    const persisted = (upsertExpenseItem as jest.Mock).mock.calls[0][0];
    expect(persisted.canonicalName).toBe('Mleko Łaciate 3,2% 1L');
  });

  it('leaves canonicalName undefined when the server item has none', async () => {
    (api.getExpenseItems as jest.Mock).mockResolvedValue([
      {
        id: 'server-item-2',
        description: 'Hand-typed item',
        quantity: 1,
        unitPrice: 9,
        totalPrice: 9,
        sortOrder: 0,
        isDeleted: false,
        syncVersion: 0,
      },
    ]);

    const items = await useExpenseStore.getState().loadExpenseItems('exp-1');

    expect(items).toHaveLength(1);
    expect(items[0].canonicalName).toBeUndefined();
  });
});
