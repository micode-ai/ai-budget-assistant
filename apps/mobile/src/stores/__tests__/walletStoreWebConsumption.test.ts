/**
 * `computeWalletSummary`'s web branch (no real SQLite on web — totals are
 * derived from the in-memory stores instead) must exclude split-receivable
 * debt rows the same way the native path's `getExpenseTotalsByCurrency` SQL
 * does. The model is `widgetData.test.ts`: call the real store action and
 * assert on the summary it actually produced; the `filterConsumption` call
 * lives inside `computeWalletSummary` itself.
 */
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

// walletStore caches cross-account balances in MMKV, which has no jest-native
// binding — mock it with an in-memory map (same shape as inflationShieldStore.test).
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

jest.mock('@/services/api', () => ({ api: {} }));
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
  useExpenseStore: { getState: jest.fn() },
}));

jest.mock('@/stores/incomeStore', () => ({
  useIncomeStore: { getState: jest.fn(() => ({ incomes: [] })) },
}));

import { useWalletStore } from '../walletStore';
import { useExpenseStore } from '@/stores/expenseStore';
import type { Expense, WalletBalance } from '@budget/shared-types';

const getExpenseState = useExpenseStore.getState as jest.Mock;

function expense(over: Record<string, unknown> = {}): Expense {
  return {
    id: 'e',
    localId: 'e',
    userId: 'u1',
    accountId: 'acc-1',
    amount: 0,
    currencyCode: 'PLN',
    date: new Date('2026-07-20'),
    isRecurring: false,
    source: 'manual',
    isDebt: false,
    isDebtRepayment: false,
    createdAt: new Date('2026-07-20'),
    updatedAt: new Date('2026-07-20'),
    isDeleted: false,
    syncStatus: 'synced',
    syncVersion: 0,
    ...over,
  } as Expense;
}

function plnBalance(initialAmount: number): WalletBalance {
  return {
    id: 'wb1',
    localId: 'wb1',
    accountId: 'acc-1',
    userId: 'u1',
    currencyCode: 'PLN',
    initialAmount,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    isDeleted: false,
    syncStatus: 'synced',
    syncVersion: 0,
  };
}

describe('computeWalletSummary (web) — split-receivable exclusion', () => {
  beforeEach(() => {
    useWalletStore.setState({
      walletBalances: [plnBalance(1000)],
      exchanges: [],
      transfers: [],
    } as any);
  });

  it('counts a 200 bill split three ways once, not 350, in the web-derived balance', async () => {
    getExpenseState.mockReturnValue({
      expenses: [
        expense({ id: 'receipt', amount: 200 }),
        expense({ id: 'd1', amount: 50, isDebt: true, isSplitReceivable: true }),
        expense({ id: 'd2', amount: 50, isDebt: true, isSplitReceivable: true }),
        expense({ id: 'd3', amount: 50, isDebt: true, isSplitReceivable: true }),
      ],
    });

    const summary = await useWalletStore.getState().computeWalletSummary();
    const pln = summary.find((s) => s.currencyCode === 'PLN');

    expect(pln?.totalExpenses).toBe(200);
    // 1000 initial - 200 real outflow. If the receivable rows were double
    // counted this would read 650, silently disagreeing with the server.
    expect(pln?.currentBalance).toBe(800);
  });

  it('still counts a standalone cash loan — that debt row is the real outflow', () => {
    getExpenseState.mockReturnValue({
      expenses: [expense({ amount: 500, isDebt: true, debtContactName: 'Anna' })],
    });

    return useWalletStore.getState().computeWalletSummary().then((summary) => {
      const pln = summary.find((s) => s.currencyCode === 'PLN');
      expect(pln?.totalExpenses).toBe(500);
      expect(pln?.currentBalance).toBe(500);
    });
  });
});
