import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { WalletBalance, CurrencyExchange, WalletSummary, Currency, SyncStatus } from '@budget/shared-types';
import { generateUUID } from '@budget/shared-utils';
import {
  loadAllWalletBalances,
  upsertWalletBalance,
  softDeleteWalletBalance,
  getExpenseTotalsByCurrency,
  getExchangeTotals,
} from '@/db/walletRepository';
import {
  loadAllExchanges,
  insertExchange,
  softDeleteExchange,
} from '@/db/currencyExchangeRepository';
import { api } from '@/services/api';
import { useAccountStore } from './accountStore';
import { useAuthStore } from './authStore';

interface WalletState {
  walletBalances: WalletBalance[];
  exchanges: CurrencyExchange[];
  walletSummary: WalletSummary[];
  isLoading: boolean;
  error: string | null;

  // Actions
  loadWallet: () => Promise<void>;
  setInitialBalance: (currencyCode: Currency, amount: number) => WalletBalance;
  updateInitialBalance: (id: string, amount: number) => void;
  removeBalance: (id: string) => void;
  addExchange: (data: {
    fromCurrency: Currency;
    toCurrency: Currency;
    fromAmount: number;
    toAmount: number;
    exchangeRate: number;
    date: Date;
    notes?: string;
  }) => CurrencyExchange;
  deleteExchange: (id: string) => void;

  // Computed
  computeWalletSummary: () => Promise<WalletSummary[]>;
  getBalanceForCurrency: (currencyCode: Currency) => number;
}

export const useWalletStore = create<WalletState>()(
  subscribeWithSelector((set, get) => ({
    walletBalances: [],
    exchanges: [],
    walletSummary: [],
    isLoading: false,
    error: null,

    loadWallet: async () => {
      set({ isLoading: true, error: null });
      try {
        const accountId = useAccountStore.getState().currentAccountId;
        if (!accountId) {
          set({ isLoading: false });
          return;
        }

        // 1. Load from local DB
        const localBalances = await loadAllWalletBalances(accountId);
        const localExchanges = await loadAllExchanges(accountId);
        set({ walletBalances: localBalances, exchanges: localExchanges });

        // 2. Compute summary from local data
        const summary = await get().computeWalletSummary();
        set({ walletSummary: summary, isLoading: false });

        // 3. Sync from server
        try {
          const serverBalances = await api.getWalletBalances();
          if (Array.isArray(serverBalances)) {
            for (const sb of serverBalances) {
              const balance: WalletBalance = {
                id: sb.clientId || sb.id,
                localId: sb.clientId || sb.id,
                serverId: sb.id,
                accountId: sb.accountId,
                userId: sb.userId,
                currencyCode: sb.currencyCode as Currency,
                initialAmount: Number(sb.initialAmount),
                createdAt: new Date(sb.createdAt),
                updatedAt: new Date(sb.updatedAt),
                isDeleted: sb.isDeleted || false,
                syncStatus: 'synced' as SyncStatus,
                syncVersion: sb.syncVersion || 0,
              };
              await upsertWalletBalance(balance);
            }
          }

          const serverExchanges = await api.getCurrencyExchanges();
          if (Array.isArray(serverExchanges)) {
            for (const se of serverExchanges) {
              const exchange: CurrencyExchange = {
                id: se.clientId || se.id,
                localId: se.clientId || se.id,
                serverId: se.id,
                accountId: se.accountId,
                userId: se.userId,
                fromCurrency: se.fromCurrency as Currency,
                toCurrency: se.toCurrency as Currency,
                fromAmount: Number(se.fromAmount),
                toAmount: Number(se.toAmount),
                exchangeRate: Number(se.exchangeRate),
                date: new Date(se.date),
                notes: se.notes ?? undefined,
                createdAt: new Date(se.createdAt),
                updatedAt: new Date(se.updatedAt),
                isDeleted: se.isDeleted || false,
                syncStatus: 'synced' as SyncStatus,
                syncVersion: se.syncVersion || 0,
              };
              await insertExchange(exchange);
            }
          }

          // Reload after server sync
          const merged = await loadAllWalletBalances(accountId);
          const mergedExchanges = await loadAllExchanges(accountId);
          set({ walletBalances: merged, exchanges: mergedExchanges });

          const updatedSummary = await get().computeWalletSummary();
          set({ walletSummary: updatedSummary });
        } catch (e) {
          console.log('Wallet server sync skipped:', e);
        }
      } catch (e) {
        console.error('Failed to load wallet:', e);
        set({ error: 'Failed to load wallet', isLoading: false });
      }
    },

    setInitialBalance: (currencyCode, amount) => {
      const id = generateUUID();
      const now = new Date();
      const accountId = useAccountStore.getState().currentAccountId || '';
      const userId = useAuthStore.getState().user?.id || '';

      const newBalance: WalletBalance = {
        id,
        localId: id,
        accountId,
        userId,
        currencyCode,
        initialAmount: amount,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        syncStatus: 'pending' as SyncStatus,
        syncVersion: 0,
      };

      // Replace existing balance for same currency or add new
      set((state) => {
        const existing = state.walletBalances.findIndex(
          (b) => b.currencyCode === currencyCode && !b.isDeleted,
        );
        if (existing >= 0) {
          const updated = [...state.walletBalances];
          updated[existing] = { ...updated[existing], initialAmount: amount, updatedAt: now, syncStatus: 'pending' as SyncStatus };
          return { walletBalances: updated };
        }
        return { walletBalances: [...state.walletBalances, newBalance] };
      });

      // Persist locally
      const balanceToSave = get().walletBalances.find(
        (b) => b.currencyCode === currencyCode && !b.isDeleted,
      ) || newBalance;
      upsertWalletBalance(balanceToSave).catch((e) =>
        console.error('Failed to save wallet balance to SQLite:', e),
      );

      // Sync to server
      api.setWalletBalance({
        localId: balanceToSave.localId,
        currencyCode,
        initialAmount: amount,
      }).catch((e) =>
        console.error('Failed to sync wallet balance to server:', e),
      );

      // Recompute summary
      get().computeWalletSummary().then((summary) => set({ walletSummary: summary }));

      return balanceToSave;
    },

    updateInitialBalance: (id, amount) => {
      const now = new Date();
      set((state) => ({
        walletBalances: state.walletBalances.map((b) =>
          b.id === id
            ? { ...b, initialAmount: amount, updatedAt: now, syncStatus: 'pending' as SyncStatus }
            : b,
        ),
      }));

      const balance = get().walletBalances.find((b) => b.id === id);
      if (balance) {
        upsertWalletBalance(balance).catch((e) =>
          console.error('Failed to update wallet balance in SQLite:', e),
        );
        api.setWalletBalance({
          localId: balance.localId,
          currencyCode: balance.currencyCode,
          initialAmount: amount,
        }).catch((e) =>
          console.error('Failed to sync wallet balance update to server:', e),
        );
      }

      get().computeWalletSummary().then((summary) => set({ walletSummary: summary }));
    },

    removeBalance: (id) => {
      const balance = get().walletBalances.find((b) => b.id === id);
      if (!balance) return;

      set((state) => ({
        walletBalances: state.walletBalances.filter((b) => b.id !== id),
      }));

      softDeleteWalletBalance(id, new Date()).catch((e) =>
        console.error('Failed to delete wallet balance from SQLite:', e),
      );

      api.deleteWalletBalance(balance.currencyCode).catch((e) =>
        console.error('Failed to delete wallet balance from server:', e),
      );

      get().computeWalletSummary().then((summary) => set({ walletSummary: summary }));
    },

    addExchange: (data) => {
      const id = generateUUID();
      const now = new Date();
      const accountId = useAccountStore.getState().currentAccountId || '';
      const userId = useAuthStore.getState().user?.id || '';

      const newExchange: CurrencyExchange = {
        id,
        localId: id,
        accountId,
        userId,
        ...data,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        syncStatus: 'pending' as SyncStatus,
        syncVersion: 0,
      };

      set((state) => ({
        exchanges: [newExchange, ...state.exchanges],
      }));

      insertExchange(newExchange).catch((e) =>
        console.error('Failed to insert exchange into SQLite:', e),
      );

      api.createCurrencyExchange({
        localId: id,
        fromCurrency: data.fromCurrency,
        toCurrency: data.toCurrency,
        fromAmount: data.fromAmount,
        toAmount: data.toAmount,
        exchangeRate: data.exchangeRate,
        date: data.date instanceof Date ? data.date.toISOString() : data.date,
        notes: data.notes,
      }).catch((e) =>
        console.error('Failed to sync exchange to server:', e),
      );

      get().computeWalletSummary().then((summary) => set({ walletSummary: summary }));

      return newExchange;
    },

    deleteExchange: (id) => {
      set((state) => ({
        exchanges: state.exchanges.filter((e) => e.id !== id),
      }));

      softDeleteExchange(id, new Date()).catch((e) =>
        console.error('Failed to delete exchange from SQLite:', e),
      );

      api.deleteCurrencyExchange(id).catch((e) =>
        console.error('Failed to delete exchange from server:', e),
      );

      get().computeWalletSummary().then((summary) => set({ walletSummary: summary }));
    },

    computeWalletSummary: async () => {
      const accountId = useAccountStore.getState().currentAccountId;
      if (!accountId) return [];

      const balances = get().walletBalances.filter((b) => !b.isDeleted);
      const expenseTotals = await getExpenseTotalsByCurrency(accountId);
      const { exchangedIn, exchangedOut } = await getExchangeTotals(accountId);

      const summary: WalletSummary[] = balances.map((wb) => {
        const totalExpenses = expenseTotals[wb.currencyCode] || 0;
        const totalExchangedIn = exchangedIn[wb.currencyCode] || 0;
        const totalExchangedOut = exchangedOut[wb.currencyCode] || 0;
        const currentBalance = wb.initialAmount - totalExpenses + totalExchangedIn - totalExchangedOut;

        return {
          currencyCode: wb.currencyCode as Currency,
          initialAmount: wb.initialAmount,
          totalExpenses,
          totalExchangedIn,
          totalExchangedOut,
          currentBalance,
        };
      });

      return summary;
    },

    getBalanceForCurrency: (currencyCode) => {
      const summary = get().walletSummary.find((s) => s.currencyCode === currencyCode);
      return summary?.currentBalance ?? 0;
    },
  })),
);
