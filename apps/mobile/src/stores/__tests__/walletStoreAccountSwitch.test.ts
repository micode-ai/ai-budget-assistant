/**
 * Switching accounts must never leave the previous account's balances on
 * screen. Two ways it did: the web summary's failure path keeps "the current
 * figures" (which, right after a switch, were the OLD account's), and a
 * summary request for the old account that answered after the switch was
 * written over the new one.
 */
const mockAccount = { id: 'acc-1' };

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
    getWalletSummary: jest.fn(),
  },
}));

jest.mock('@/services/encryptionHelper', () => ({
  maybeEncrypt: jest.fn(async (_e: unknown, x: unknown) => x),
  maybeDecrypt: jest.fn(async (_e: unknown, x: unknown) => x),
}));

jest.mock('@/stores/accountStore', () => ({
  useAccountStore: { getState: jest.fn(() => ({ currentAccountId: mockAccount.id })) },
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

import { useWalletStore, walletLoadedFor } from '../walletStore';
import { api } from '@/services/api';

const getWalletSummary = api.getWalletSummary as jest.Mock;
const pln = (amount: number) => [{ currencyCode: 'PLN', initialAmount: 0, currentBalance: amount }];

describe('walletStore across an account switch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccount.id = 'acc-1';
    useWalletStore.getState().reset();
    (api.getWalletBalances as jest.Mock).mockResolvedValue([]);
    (api.getCurrencyExchanges as jest.Mock).mockResolvedValue([]);
    (api.getAccountTransfers as jest.Mock).mockResolvedValue([]);
  });

  it("does not keep the previous account's summary when the new account's request fails", async () => {
    getWalletSummary.mockResolvedValue({ balances: pln(500) });
    await useWalletStore.getState().loadWallet();
    expect(useWalletStore.getState().walletSummary).toEqual(pln(500));

    mockAccount.id = 'acc-2';
    getWalletSummary.mockRejectedValue(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await useWalletStore.getState().loadWallet();
    warn.mockRestore();

    expect(useWalletStore.getState().walletSummary).toEqual([]);
  });

  it("does not write the old account's late answer over the new account", async () => {
    let answerOld!: (v: unknown) => void;
    getWalletSummary.mockImplementationOnce(() => new Promise((r) => { answerOld = r; }));
    const oldLoad = useWalletStore.getState().loadWallet();
    await new Promise((r) => setTimeout(r, 0));

    mockAccount.id = 'acc-2';
    getWalletSummary.mockResolvedValue({ balances: pln(42) });
    await useWalletStore.getState().loadWallet();
    expect(useWalletStore.getState().walletSummary).toEqual(pln(42));

    answerOld({ balances: pln(500) });
    await oldLoad;
    expect(useWalletStore.getState().walletSummary).toEqual(pln(42));
  });
  // A switch that does not go through AccountSwitcher (a notification, a trip
  // invite, the trip screen) never calls loadWallet itself. The dashboard asks
  // this to notice the wallet still holds another account's figures.
  it('reports which account the in-memory wallet belongs to', async () => {
    expect(walletLoadedFor()).toBeNull();
    getWalletSummary.mockResolvedValue({ balances: pln(1) });
    await useWalletStore.getState().loadWallet();
    expect(walletLoadedFor()).toBe('acc-1');
    mockAccount.id = 'acc-2';
    expect(walletLoadedFor()).toBe('acc-1'); // switched, not reloaded yet
    await useWalletStore.getState().loadWallet();
    expect(walletLoadedFor()).toBe('acc-2');
    useWalletStore.getState().reset();
    expect(walletLoadedFor()).toBeNull();
  });
});
