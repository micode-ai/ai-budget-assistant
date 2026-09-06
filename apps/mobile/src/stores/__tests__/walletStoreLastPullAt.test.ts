/**
 * `walletStore.lastPullAt` is the wallet twin of the fields ABA-507 added to
 * `expenseStore`/`incomeStore`, and it is the only evidence that the wallet
 * server pull actually answered. If it were never written, or were written on
 * the failure path too, `shouldShowSetupChecklist` would be a correct function
 * fed a lie — so the field is pinned here rather than left to integration.
 *
 * The model is `walletStoreWebConsumption.test.ts`: mock the leaves, call the
 * real store action, assert on the state it actually produced.
 */
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

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

jest.mock('@/db/walletRepository', () => ({
  loadAllWalletBalances: jest.fn().mockResolvedValue([]),
  upsertWalletBalance: jest.fn().mockResolvedValue(undefined),
  softDeleteWalletBalance: jest.fn().mockResolvedValue(undefined),
  getExpenseTotalsByCurrency: jest.fn().mockResolvedValue({}),
  getIncomeTotalsByCurrency: jest.fn().mockResolvedValue({}),
  getExchangeTotals: jest.fn().mockResolvedValue({ exchangedIn: {}, exchangedOut: {} }),
  getTransferTotals: jest.fn().mockResolvedValue({ transferredIn: {}, transferredOut: {} }),
}));

jest.mock('@/db/currencyExchangeRepository', () => ({
  loadAllExchanges: jest.fn().mockResolvedValue([]),
  insertExchange: jest.fn().mockResolvedValue(undefined),
  updateExchangeInDb: jest.fn().mockResolvedValue(undefined),
  softDeleteExchange: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/accountTransferRepository', () => ({
  loadTransfersByAccount: jest.fn().mockResolvedValue([]),
  loadPendingTransfers: jest.fn().mockResolvedValue([]),
  insertTransfer: jest.fn().mockResolvedValue(undefined),
  updateTransferInDb: jest.fn().mockResolvedValue(undefined),
  softDeleteTransfer: jest.fn().mockResolvedValue(undefined),
  setTransferServerId: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/incomeRepository', () => ({
  insertIncome: jest.fn().mockResolvedValue(undefined),
  softDeleteIncomeInDb: jest.fn().mockResolvedValue(undefined),
  moveIncomeAccountInDb: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/syncMetadataRepository', () => ({
  setLastSyncTime: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/api', () => ({
  api: {
    getWalletBalances: jest.fn(),
    getCurrencyExchanges: jest.fn(),
    getAccountTransfers: jest.fn(),
  },
}));

jest.mock('@/services/encryptionHelper', () => ({
  maybeEncrypt: jest.fn(async (_e: unknown, x: unknown) => x),
  maybeDecrypt: jest.fn(async (_e: unknown, x: unknown) => x),
}));

jest.mock('@/stores/accountStore', () => ({
  useAccountStore: { getState: jest.fn(() => ({ currentAccountId: 'acc-1' })) },
}));

jest.mock('@/stores/authStore', () => ({
  useAuthStore: { getState: jest.fn(() => ({})) },
}));

jest.mock('@/stores/expenseStore', () => ({
  useExpenseStore: { getState: jest.fn(() => ({ expenses: [] })) },
}));

jest.mock('@/stores/incomeStore', () => ({
  useIncomeStore: { getState: jest.fn(() => ({ incomes: [] })) },
}));

import { useWalletStore } from '../walletStore';
import { api } from '@/services/api';

const getWalletBalances = api.getWalletBalances as jest.Mock;
const getCurrencyExchanges = api.getCurrencyExchanges as jest.Mock;
const getAccountTransfers = api.getAccountTransfers as jest.Mock;

describe('walletStore.lastPullAt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // reset() is the real logout action, and it must clear this field — a new
    // user inheriting the previous one's "the server answered" evidence is
    // exactly the false positive the field exists to prevent.
    useWalletStore.getState().reset();
    getWalletBalances.mockResolvedValue([]);
    getCurrencyExchanges.mockResolvedValue([]);
    getAccountTransfers.mockResolvedValue([]);
  });

  it('starts null, because the wallet has not answered yet', () => {
    // Breaks if: the initial value is anything but null, or if reset() stops
    // clearing it. Either turns a fresh session into "we already heard back",
    // and the checklist then reads an empty wallet as a configured one.
    expect(useWalletStore.getState().lastPullAt).toBeNull();
  });

  it('records the moment the server pull succeeds', async () => {
    // Breaks if: `lastPullAt: Date.now()` is dropped from the success-path
    // `set()` in syncWalletFromServer. Without it the checklist never
    // considers the wallet answered and the card silently never renders.
    const before = Date.now();

    await useWalletStore.getState().loadWallet();

    const { lastPullAt } = useWalletStore.getState();
    expect(typeof lastPullAt).toBe('number');
    expect(lastPullAt as number).toBeGreaterThanOrEqual(before);
  });

  it('leaves it null when the pull fails, so a failure is never read as an empty wallet', async () => {
    // Breaks if: the assignment is moved above `await api.getWalletBalances()`,
    // or into the outer `catch`. On web the failure is swallowed with a
    // console.warn and no error flag is set, so this field staying null is the
    // ONLY way a caller can tell "no balances" from "never answered".
    getWalletBalances.mockRejectedValue(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await useWalletStore.getState().loadWallet();

    expect(useWalletStore.getState().lastPullAt).toBeNull();
    // Pinning the swallow itself: if this ever starts rejecting or setting
    // `error`, the premise above changes and this should be revisited rather
    // than quietly kept.
    expect(useWalletStore.getState().error).toBeNull();
    warn.mockRestore();
  });

  it('is cleared again by reset, not only initialised to null once', async () => {
    // Breaks if: `lastPullAt: null` is dropped from reset()'s `set()`. The
    // initial-value test above passes either way, because reset() is what it
    // calls to get there — only a pull-then-reset sequence can tell them
    // apart, and logout is exactly that sequence.
    await useWalletStore.getState().loadWallet();
    expect(useWalletStore.getState().lastPullAt).not.toBeNull();

    useWalletStore.getState().reset();
    expect(useWalletStore.getState().lastPullAt).toBeNull();
  });
});
