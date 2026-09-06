/**
 * `lastPullAt` is the whole point of ABA-507's store change: it is the only
 * evidence that the server actually answered. If it were never written, or
 * were written on the failure path too, `resolveWebFirstRun` would be a
 * correct function fed a lie — so the field is pinned here rather than left to
 * integration.
 *
 * `incomeStore` is tested rather than `expenseStore` because its pull lives in
 * the store file itself; both success paths are one line apart in shape and
 * the expense twin is asserted structurally by `tsc` (`SyncableState` now
 * carries the field, so the `set()` call cannot silently drop it).
 *
 * The model is `walletStoreWebConsumption.test.ts`: mock the leaves, call the
 * real store action, assert on the state it actually produced.
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
  getCategoryById: jest.fn().mockResolvedValue(null),
  upsertCategory: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/syncMetadataRepository', () => ({
  setLastSyncTime: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/client', () => ({
  withTransaction: jest.fn((fn: () => Promise<void>) => fn()),
}));

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

jest.mock('@/stores/categoryStore', () => ({
  useCategoryStore: { getState: jest.fn(() => ({ loadCategories: jest.fn().mockResolvedValue(undefined) })) },
}));

jest.mock('@/stores/gamificationStore', () => ({
  useGamificationStore: { getState: jest.fn(() => ({})) },
}));

import { useIncomeStore } from '../incomeStore';
import { api } from '@/services/api';

const getIncomes = api.getIncomes as jest.Mock;

describe('incomeStore.lastPullAt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // reset() is the real logout action, and it must clear this field — a new
    // user inheriting the previous one's "the server answered" evidence is
    // exactly the false positive this whole field exists to prevent.
    useIncomeStore.getState().reset();
  });

  it('starts null, because nothing has answered yet', () => {
    // Breaks if: the initial value is anything but null, or if reset() stops
    // clearing it. Either turns a fresh session into "we already heard back".
    expect(useIncomeStore.getState().lastPullAt).toBeNull();
  });

  it('records the moment the server pull succeeds', () => {
    // Breaks if: `lastPullAt: Date.now()` is dropped from the success-path
    // `set()` in loadIncomes. Without it the dashboard's first-run predicate
    // never leaves 'wait' and the whole feature silently does nothing.
    getIncomes.mockResolvedValue({ data: [] });
    const before = Date.now();

    return useIncomeStore
      .getState()
      .loadIncomes({ force: true })
      .then(() => {
        const { lastPullAt } = useIncomeStore.getState();
        expect(typeof lastPullAt).toBe('number');
        expect(lastPullAt as number).toBeGreaterThanOrEqual(before);
      });
  });

  it('leaves it null when the pull fails, so a failure is never read as an empty account', () => {
    // Breaks if: the assignment is moved above the `await api.getIncomes()`,
    // or out of the inner try into the outer one. On web the failure is
    // swallowed with a console.warn and no error flag is set, so this field
    // staying null is the ONLY way the caller can tell the two apart.
    getIncomes.mockRejectedValue(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    return useIncomeStore
      .getState()
      .loadIncomes({ force: true })
      .then(() => {
        expect(useIncomeStore.getState().lastPullAt).toBeNull();
        // Pinning the swallow itself: if this ever starts rejecting or setting
        // `error`, the premise of resolveWebFirstRun changes and it should be
        // revisited rather than quietly kept.
        expect(useIncomeStore.getState().error).toBeNull();
        warn.mockRestore();
      });
  });
});
