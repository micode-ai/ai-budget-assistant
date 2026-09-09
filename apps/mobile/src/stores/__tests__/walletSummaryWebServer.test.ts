/**
 * On web, the wallet summary must come from the server's own aggregate
 * (`GET /wallet/summary`), not from the local reconstruction.
 *
 * ## The bug this pins
 *
 * `computeWalletSummaryLocal` rebuilds each currency's balance from
 * `initialAmount + incomes − expenses ± exchanges ± transfers`. On native that
 * is correct: every one of those inputs comes from SQLite, which holds the
 * whole account. On web SQLite is a no-op mock, so the same computation reads
 * the in-memory stores — and is therefore right only if FOUR independent
 * network pulls have all landed first.
 *
 * They do not. `loadWallet` computes the summary in the same `Promise.allSettled`
 * batch that loads expenses, so on a real page load the dashboard rendered
 * `initialAmount 0 + incomes − 0`, i.e. **exactly the account's total income**
 * presented as its balance: measured live at EUR 1051.38 / PLN 106084 / USD 300
 * against real balances of 331.58 / 3803.76 / 1900. Nothing recomputed it when
 * the other pulls arrived, so the wrong figure simply stayed.
 *
 * `hydrateTransactions` already carries a web-only recompute for exactly this
 * race — but it repairs only the expenses/incomes half, leaving the base
 * (`initialAmount`, exchanges, transfers) at whatever the wallet pull managed
 * to fetch. A reconstruction needing four sources cannot be made reliable by
 * patching one of them, which is why this replaces the approach rather than
 * adding a fifth patch.
 *
 * The server already computes this number, applies `EXCLUDE_SPLIT_RECEIVABLE`
 * itself, and answered in ~300ms when measured. Asking it is one request that
 * cannot race anything.
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
  insertTransfer: jest.fn().mockResolvedValue(undefined),
  updateTransferInDb: jest.fn().mockResolvedValue(undefined),
  softDeleteTransfer: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/incomeRepository', () => ({
  insertIncome: jest.fn().mockResolvedValue(undefined),
  softDeleteIncomeInDb: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/db/syncMetadataRepository', () => ({
  setLastSyncTime: jest.fn().mockResolvedValue(undefined),
}));

const mockGetWalletSummary = jest.fn();
jest.mock('@/services/api', () => ({ api: { getWalletSummary: (...a: unknown[]) => mockGetWalletSummary(...a) } }));

jest.mock('@/services/encryptionHelper', () => ({
  maybeEncrypt: jest.fn(),
  maybeDecrypt: jest.fn(),
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
import type { WalletSummary } from '@budget/shared-types';

const SERVER_ROW: WalletSummary = {
  currencyCode: 'PLN',
  initialAmount: 8400,
  totalIncomes: 106084,
  totalExpenses: 89029.86,
  totalExchangedIn: 74442.02,
  totalExchangedOut: 0,
  totalTransferredIn: 0,
  totalTransferredOut: 96092.4,
  currentBalance: 3803.76,
} as WalletSummary;

describe('computeWalletSummary on web', () => {
  beforeEach(() => {
    mockGetWalletSummary.mockReset();
    useWalletStore.setState({ walletBalances: [], exchanges: [], transfers: [], walletSummary: [] } as never);
  });

  it('returns the server’s balances verbatim', async () => {
    mockGetWalletSummary.mockResolvedValue({ balances: [SERVER_ROW] });

    const summary = await useWalletStore.getState().computeWalletSummary();

    expect(mockGetWalletSummary).toHaveBeenCalledTimes(1);
    expect(summary).toEqual([SERVER_ROW]);
  });

  it('never reconstructs the balance from the in-memory stores', async () => {
    // The whole defect in one assertion: with no expenses loaded yet, the local
    // reconstruction produced `incomes` as the balance. The server's own number
    // must win regardless of what the stores happen to hold at this instant.
    mockGetWalletSummary.mockResolvedValue({ balances: [SERVER_ROW] });

    const summary = await useWalletStore.getState().computeWalletSummary();

    expect(summary[0].currentBalance).toBe(3803.76);
    expect(summary[0].currentBalance).not.toBe(SERVER_ROW.totalIncomes);
  });

  it('keeps the previous summary when the request fails, rather than wiping or inventing one', async () => {
    // A failed pull must not look like "this account has no money". Returning
    // what is already on screen leaves the caller's `set` a no-op; the retry in
    // `useHomeScreenData` is what actually repairs it.
    useWalletStore.setState({ walletSummary: [SERVER_ROW] } as never);
    mockGetWalletSummary.mockRejectedValue(new TypeError('Failed to fetch'));

    const summary = await useWalletStore.getState().computeWalletSummary();

    expect(summary).toEqual([SERVER_ROW]);
  });

  it('exposes the local reconstruction separately, for the native path', async () => {
    // Kept and still called on native, where SQLite really does hold every
    // input. Its own accounting invariant (split-receivable exclusion) is
    // pinned by `walletStoreWebConsumption.test.ts`.
    expect(typeof useWalletStore.getState().computeWalletSummaryLocal).toBe('function');
  });
});
