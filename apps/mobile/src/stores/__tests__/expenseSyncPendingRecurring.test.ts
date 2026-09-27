/**
 * ABA-615: an expense can now start a recurring series from the EDIT screen,
 * not only the create form. `updateExpense`'s own immediate `api.updateExpense`
 * call already carried isRecurring/recurringId/recurringPeriod (it forwards
 * whatever partial is passed straight through) — but `syncPendingExpenses` is
 * the RETRY path for that same edit when it was made offline (an
 * already-synced row flips back to `syncStatus: 'pending'`), and it resends
 * the row through `api.createExpense`'s upsert-by-clientId, not a PATCH. That
 * upsert's `update:` branch falls back to `dto.isRecurring ?? false`
 * server-side, so omitting these three fields here would silently un-recur a
 * series the user just started, the moment the device came back online.
 *
 * This exercises the real `syncPendingExpenses` (not the `../expenseSync`
 * wholesale mock other store tests use, since that mock is exactly what
 * would hide this regression) against a minimal set of dependency mocks —
 * same relative-path mocking convention as `expenseItemSync.test.ts`.
 */
import { syncPendingExpenses } from '../expenseSync';
import { api } from '../../services/api';

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
  useCategoryStore: { getState: () => ({}) },
}));

jest.mock('../projectStore', () => ({
  useProjectStore: { getState: () => ({}) },
}));

const mockApi = api as jest.Mocked<typeof api>;

function makePendingExpense(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'exp-1',
    localId: 'exp-1',
    accountId: 'acc-1',
    amount: 42,
    currencyCode: 'PLN',
    description: 'Netflix',
    date: new Date('2026-01-01T00:00:00.000Z'),
    source: 'manual',
    syncStatus: 'pending',
    isDeleted: false,
    ...over,
  };
}

const noopSet = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('syncPendingExpenses — recurring fields', () => {
  it('carries isRecurring/recurringId/recurringPeriod for an offline-retried edit that started a series', async () => {
    const expense = makePendingExpense({
      isRecurring: true,
      recurringId: 'r-uuid-1',
      recurringPeriod: 'monthly',
    });
    const get = () => ({ expenses: [expense], isLoading: false, error: null, lastPullAt: null });

    await syncPendingExpenses(noopSet as any, get as any);

    expect(mockApi.createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        isRecurring: true,
        recurringId: 'r-uuid-1',
        recurringPeriod: 'monthly',
      }),
    );
  });

  it('does not force isRecurring:false on a plain (never-recurring) pending expense', async () => {
    const expense = makePendingExpense();
    const get = () => ({ expenses: [expense], isLoading: false, error: null, lastPullAt: null });

    await syncPendingExpenses(noopSet as any, get as any);

    // expense.isRecurring is undefined on this fixture, so the `|| undefined`
    // convention below must not turn that into a literal `false` — the
    // server's upsert `update:` branch treats an explicit `false` and an
    // absent field identically (`dto.isRecurring ?? false`), but asserting
    // `undefined` here still pins the exact convention used everywhere else
    // this expense is pushed (addExpense's own first-push call).
    expect(mockApi.createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        isRecurring: undefined,
        recurringId: undefined,
        recurringPeriod: undefined,
      }),
    );
  });
});
