/**
 * The 30-second "we synced recently, skip the server" throttles must not
 * survive a sign-out.
 *
 * ## The bug this pins
 *
 * `expenseSync.ts` and `incomeStore.ts` each keep the throttle in MODULE
 * scope — `_lastExpensesSyncAt` / `_lastExpensesSyncedAccountId` and their
 * income twins — and nothing reset them. `reset()` cleared the store's state
 * and left the throttle alone.
 *
 * So signing out and back in within 30 seconds, onto the same account, hit all
 * three of these at once:
 *
 *   1. `expenseStore.reset()` emptied the in-memory list;
 *   2. `accountStore.initialize` (on the login path) called `clearAllExpenses()`,
 *      emptying the local DB too;
 *   3. the first `loadExpenses()` after login saw `_lastExpensesSyncedAccountId`
 *      still equal to this account and a timestamp seconds old, decided the
 *      data was fresh, and **returned before requesting anything**.
 *
 * The result was a dashboard reporting `0 transactions`, `Income +0,00`,
 * `Expenses −0,00`, an empty Net Profit chart ("Not enough data yet") and a
 * monthly budget at 0% — on an account with years of history, while the wallet
 * cards beside them showed correct figures because those come straight from the
 * server (ABA-518). It is not web-only in principle: step 2 wipes SQLite on
 * every platform, so a fast enough sign-out/sign-in cycle strands native too.
 *
 * Resetting the throttle from inside `reset()` — rather than from the logout
 * action — is deliberate: anything that tears the store down gets the throttle
 * cleared with it, so a future teardown path cannot forget.
 */

jest.mock('@/db/expenseRepository', () => ({
  loadAllExpenses: jest.fn().mockResolvedValue([]),
  insertExpense: jest.fn().mockResolvedValue(undefined),
  updateExpenseInDb: jest.fn().mockResolvedValue(undefined),
  softDeleteExpenseInDb: jest.fn().mockResolvedValue(undefined),
  setExpenseServerId: jest.fn().mockResolvedValue(undefined),
  moveExpenseAccountInDb: jest.fn().mockResolvedValue(undefined),
  getExpenseTotalsByCurrency: jest.fn().mockResolvedValue({}),
  countTransactions: jest.fn().mockResolvedValue(0),
  bulkRenameMerchant: jest.fn().mockResolvedValue(0),
  bulkMergeMerchants: jest.fn().mockResolvedValue(0),
  clearAllExpenses: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/expenseItemRepository', () => ({
  loadItemsForExpense: jest.fn().mockResolvedValue([]),
  getSplitsForExpenses: jest.fn().mockResolvedValue({}),
  insertExpenseItem: jest.fn().mockResolvedValue(undefined),
  bulkInsertExpenseItems: jest.fn().mockResolvedValue(undefined),
  updateExpenseItemInDb: jest.fn().mockResolvedValue(undefined),
  softDeleteExpenseItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/splitRepository', () => ({
  getSplitsForExpenses: jest.fn().mockResolvedValue({}),
  bulkInsertSplits: jest.fn().mockResolvedValue(undefined),
  softDeleteSplitsForExpense: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/projectRepository', () => ({
  getAllProjectExpenseMappings: jest.fn().mockResolvedValue([]),
  upsertProject: jest.fn().mockResolvedValue(undefined),
  addExpenseToProject: jest.fn().mockResolvedValue(undefined),
  removeExpenseFromProject: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/categoryRepository', () => ({
  upsertCategory: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/tripExpenseShareRepository', () => ({
  bulkInsertShares: jest.fn().mockResolvedValue(undefined),
  softDeleteSharesForExpense: jest.fn().mockResolvedValue(undefined),
  getSharesForExpenses: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/db/syncMetadataRepository', () => ({
  setLastSyncTime: jest.fn().mockResolvedValue(undefined),
  getLastSyncTime: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/db/client', () => ({
  withTransaction: jest.fn(async (fn: () => Promise<void>) => {
    await fn();
  }),
}));

const mockGetExpenses = jest.fn();
jest.mock('@/services/api', () => ({
  api: {
    getExpenses: () => mockGetExpenses(),
    setLogoutHandler: jest.fn(),
    setAccountIdGetter: jest.fn(),
  },
}));

jest.mock('@/services/encryptionHelper', () => ({
  maybeEncrypt: jest.fn(),
  maybeDecrypt: jest.fn(async (row: unknown) => row),
}));

jest.mock('@/stores/accountStore', () => ({
  useAccountStore: { getState: jest.fn(() => ({ currentAccountId: 'acc-1' })) },
}));

jest.mock('@/stores/categoryStore', () => ({
  useCategoryStore: { getState: jest.fn(() => ({ loadCategories: jest.fn().mockResolvedValue(undefined) })) },
}));

jest.mock('@/stores/projectStore', () => ({
  useProjectStore: { getState: jest.fn(() => ({ loadProjects: jest.fn().mockResolvedValue(undefined) })) },
}));

jest.mock('@/stores/gamificationStore', () => ({
  useGamificationStore: { getState: jest.fn(() => ({ loadProgress: jest.fn() })) },
}));

jest.mock('@/services/widgetData', () => ({ updateWidgetData: jest.fn() }));

import { useExpenseStore } from '../expenseStore';

describe('the expense sync throttle does not survive a store reset', () => {
  beforeEach(() => {
    mockGetExpenses.mockReset().mockResolvedValue({ data: [] });
    useExpenseStore.getState().reset();
  });

  it('skips a second pull inside the window — the throttle still works', async () => {
    await useExpenseStore.getState().loadExpenses();
    await useExpenseStore.getState().loadExpenses();

    expect(mockGetExpenses).toHaveBeenCalledTimes(1);
  });

  it('pulls again after a reset, even inside the window', async () => {
    // This is the sign-out/sign-in case. Before the fix the second call
    // returned without requesting anything, leaving the store — and, since the
    // login path also clears SQLite, the local DB — empty.
    await useExpenseStore.getState().loadExpenses();
    expect(mockGetExpenses).toHaveBeenCalledTimes(1);

    useExpenseStore.getState().reset();
    await useExpenseStore.getState().loadExpenses();

    expect(mockGetExpenses).toHaveBeenCalledTimes(2);
  });

  it('still honours an explicit force, reset or not', async () => {
    await useExpenseStore.getState().loadExpenses();
    await useExpenseStore.getState().loadExpenses({ force: true });

    expect(mockGetExpenses).toHaveBeenCalledTimes(2);
  });
});
