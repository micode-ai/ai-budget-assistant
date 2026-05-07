import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { WalletBalance, CurrencyExchange, AccountTransfer, Income, WalletSummary, Currency, SyncStatus } from '@budget/shared-types';
import { generateUUID } from '@budget/shared-utils';
import {
  loadAllWalletBalances,
  upsertWalletBalance,
  softDeleteWalletBalance,
  getExpenseTotalsByCurrency,
  getIncomeTotalsByCurrency,
  getExchangeTotals,
  getTransferTotals,
} from '@/db/walletRepository';
import {
  loadAllExchanges,
  insertExchange,
  updateExchangeInDb,
  softDeleteExchange,
} from '@/db/currencyExchangeRepository';
import {
  loadTransfersByAccount,
  insertTransfer,
  updateTransferInDb,
  softDeleteTransfer,
} from '@/db/accountTransferRepository';
import { insertIncome, softDeleteIncomeInDb } from '@/db/incomeRepository';
import { setLastSyncTime } from '@/db/syncMetadataRepository';
import { api } from '@/services/api';
import { maybeEncrypt, maybeDecrypt } from '@/services/encryptionHelper';
import { useAccountStore } from './accountStore';
import { useAuthStore } from './authStore';

interface WalletState {
  walletBalances: WalletBalance[];
  exchanges: CurrencyExchange[];
  transfers: AccountTransfer[];
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
  updateExchange: (id: string, updates: Partial<CurrencyExchange>) => void;
  deleteExchange: (id: string) => void;
  addTransfer: (data: {
    fromAccountId: string;
    fromCurrency: Currency;
    fromAmount: number;
    toAccountId: string;
    toCurrency: Currency;
    toAmount: number;
    exchangeRate: number;
    date: Date;
    notes?: string;
    countAsIncome?: boolean;
  }) => AccountTransfer;
  updateTransfer: (id: string, updates: Partial<AccountTransfer>) => void;
  deleteTransfer: (id: string) => void;

  // Computed
  computeWalletSummary: () => Promise<WalletSummary[]>;
  getBalanceForCurrency: (currencyCode: Currency) => number;

  reset: () => void;
}

export const useWalletStore = create<WalletState>()(
  subscribeWithSelector((set, get) => ({
    walletBalances: [],
    exchanges: [],
    transfers: [],
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
        const localTransfers = await loadTransfersByAccount(accountId);
        // Guard: abort if account switched during async operation
        if (useAccountStore.getState().currentAccountId !== accountId) return;
        set({ walletBalances: localBalances, exchanges: localExchanges, transfers: localTransfers });

        // 2. Compute summary from local data
        const summary = await get().computeWalletSummary();
        set({ walletSummary: summary, isLoading: false });

        // 3. Sync from server
        try {
          const serverBalances = await api.getWalletBalances();
          // Guard: abort if account switched during server call
          if (useAccountStore.getState().currentAccountId !== accountId) return;
          if (Array.isArray(serverBalances)) {
            for (const sb of serverBalances) {
              // Decrypt encrypted fields if present
              const decryptedBal = await maybeDecrypt('walletBalance', sb, sb.accountId);

              const balance: WalletBalance = {
                id: sb.clientId || sb.id,
                localId: sb.clientId || sb.id,
                serverId: sb.id,
                accountId: sb.accountId,
                userId: sb.userId,
                currencyCode: sb.currencyCode as Currency,
                initialAmount: Number(decryptedBal.initialAmount),
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
          // Guard: abort if account switched
          if (useAccountStore.getState().currentAccountId !== accountId) return;
          if (Array.isArray(serverExchanges)) {
            for (const se of serverExchanges) {
              // Decrypt encrypted fields if present
              const decryptedExch = await maybeDecrypt('currencyExchange', se, se.accountId);

              const exchange: CurrencyExchange = {
                id: se.clientId || se.id,
                localId: se.clientId || se.id,
                serverId: se.id,
                accountId: se.accountId,
                userId: se.userId,
                fromCurrency: se.fromCurrency as Currency,
                toCurrency: se.toCurrency as Currency,
                fromAmount: Number(decryptedExch.fromAmount),
                toAmount: Number(decryptedExch.toAmount),
                exchangeRate: Number(decryptedExch.exchangeRate),
                date: new Date(se.date),
                notes: decryptedExch.notes ?? undefined,
                createdAt: new Date(se.createdAt),
                updatedAt: new Date(se.updatedAt),
                isDeleted: se.isDeleted || false,
                syncStatus: 'synced' as SyncStatus,
                syncVersion: se.syncVersion || 0,
              };
              await insertExchange(exchange);
            }
          }

          // Sync transfers from server
          try {
            const serverTransfers = await api.getAccountTransfers();
            if (useAccountStore.getState().currentAccountId !== accountId) return;
            if (Array.isArray(serverTransfers)) {
              for (const st of serverTransfers) {
                // Only store transfers relevant to current account
                if (st.fromAccountId === accountId || st.toAccountId === accountId) {
                  const transfer: AccountTransfer = {
                    id: st.clientId || st.id,
                    localId: st.clientId || st.id,
                    serverId: st.id,
                    userId: st.userId,
                    fromAccountId: st.fromAccountId,
                    fromCurrency: st.fromCurrency as Currency,
                    fromAmount: Number(st.fromAmount),
                    toAccountId: st.toAccountId,
                    toCurrency: st.toCurrency as Currency,
                    toAmount: Number(st.toAmount),
                    exchangeRate: Number(st.exchangeRate),
                    date: new Date(st.date),
                    notes: st.notes ?? undefined,
                    countAsIncome: st.countAsIncome ?? false,
                    linkedIncomeId: st.linkedIncomeId ?? undefined,
                    createdAt: new Date(st.createdAt),
                    updatedAt: new Date(st.updatedAt),
                    isDeleted: st.isDeleted || false,
                    syncStatus: 'synced' as SyncStatus,
                    syncVersion: st.syncVersion || 0,
                  };
                  await insertTransfer(transfer);
                }
              }
            }
          } catch (e) {
            console.log('Transfer server sync skipped:', e);
          }

          // Reload after server sync
          const merged = await loadAllWalletBalances(accountId);
          const mergedExchanges = await loadAllExchanges(accountId);
          const mergedTransfers = await loadTransfersByAccount(accountId);
          // Guard: abort if account switched during merge
          if (useAccountStore.getState().currentAccountId !== accountId) return;
          set({ walletBalances: merged, exchanges: mergedExchanges, transfers: mergedTransfers });

          const updatedSummary = await get().computeWalletSummary();
          set({ walletSummary: updatedSummary });
          setLastSyncTime(Date.now());
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

      // Encrypt sensitive fields and sync to server
      maybeEncrypt('walletBalance', {
        initialAmount: amount,
      }, accountId).then(({ payload: encPayload, encryptedPayload, encryptionKeyVersion }) => {
        return api.setWalletBalance({
          localId: balanceToSave.localId,
          currencyCode,
          initialAmount: encPayload.initialAmount ?? amount,
          encryptedPayload,
          encryptionKeyVersion,
        } as any);
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

      // Encrypt sensitive fields before sending to server
      maybeEncrypt('currencyExchange', {
        notes: data.notes,
        fromAmount: data.fromAmount,
        toAmount: data.toAmount,
        exchangeRate: data.exchangeRate,
      }, accountId).then(({ payload: encPayload, encryptedPayload, encryptionKeyVersion }) => {
        return api.createCurrencyExchange({
          localId: id,
          fromCurrency: data.fromCurrency,
          toCurrency: data.toCurrency,
          fromAmount: encPayload.fromAmount ?? data.fromAmount,
          toAmount: encPayload.toAmount ?? data.toAmount,
          exchangeRate: encPayload.exchangeRate ?? data.exchangeRate,
          date: data.date instanceof Date ? data.date.toISOString() : data.date,
          notes: encPayload.notes ?? data.notes,
          encryptedPayload,
          encryptionKeyVersion,
        } as any);
      }).catch((e) =>
        console.error('Failed to sync exchange to server:', e),
      );

      get().computeWalletSummary().then((summary) => set({ walletSummary: summary }));

      return newExchange;
    },

    updateExchange: (id, updates) => {
      const accountId = useAccountStore.getState().currentAccountId || '';
      const now = new Date();

      set((state) => ({
        exchanges: state.exchanges.map((e) =>
          e.id === id
            ? {
                ...e,
                ...updates,
                updatedAt: now,
                syncStatus: e.syncStatus === 'synced' ? ('pending' as SyncStatus) : e.syncStatus,
              }
            : e,
        ),
      }));

      const updated = get().exchanges.find((e) => e.id === id);
      if (!updated) return;

      updateExchangeInDb(id, updates, now, updated.syncStatus).catch((err) =>
        console.error('Failed to update exchange in SQLite:', err),
      );

      const serverIdForUpdate = updated.serverId || id;
      maybeEncrypt('currencyExchange', {
        notes: updated.notes,
        fromAmount: updated.fromAmount,
        toAmount: updated.toAmount,
        exchangeRate: updated.exchangeRate,
      }, accountId).then(({ payload: encPayload, encryptedPayload, encryptionKeyVersion }) => {
        return api.updateCurrencyExchange(serverIdForUpdate, {
          fromCurrency: updated.fromCurrency,
          toCurrency: updated.toCurrency,
          fromAmount: encPayload.fromAmount ?? updated.fromAmount,
          toAmount: encPayload.toAmount ?? updated.toAmount,
          exchangeRate: encPayload.exchangeRate ?? updated.exchangeRate,
          date: updated.date instanceof Date ? updated.date.toISOString() : updated.date,
          notes: encPayload.notes ?? updated.notes,
          encryptedPayload,
          encryptionKeyVersion,
        });
      }).catch((err) =>
        console.error('Failed to sync exchange update to server:', err),
      );

      get().computeWalletSummary().then((summary) => set({ walletSummary: summary }));
    },

    deleteExchange: (id) => {
      const exchange = get().exchanges.find((e) => e.id === id);

      set((state) => ({
        exchanges: state.exchanges.filter((e) => e.id !== id),
      }));

      softDeleteExchange(id, new Date()).catch((e) =>
        console.error('Failed to delete exchange from SQLite:', e),
      );

      const serverIdForDelete = exchange?.serverId || id;
      api.deleteCurrencyExchange(serverIdForDelete).catch((e) =>
        console.error('Failed to delete exchange from server:', e),
      );

      get().computeWalletSummary().then((summary) => set({ walletSummary: summary }));
    },

    addTransfer: (data) => {
      const id = generateUUID();
      const now = new Date();
      const userId = useAuthStore.getState().user?.id || '';
      const countAsIncome = data.countAsIncome ?? false;

      const newTransfer: AccountTransfer = {
        id,
        localId: id,
        userId,
        ...data,
        countAsIncome,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        syncStatus: 'pending' as SyncStatus,
        syncVersion: 0,
      };

      set((state) => ({
        transfers: [newTransfer, ...state.transfers],
      }));

      insertTransfer(newTransfer).catch((e) =>
        console.error('Failed to insert transfer into SQLite:', e),
      );

      // If countAsIncome, create a local Income record on the receiving account.
      // Use the same clientId pattern as the server (`transfer-income-{localId}`)
      // so that server sync upserts into the same row instead of creating a duplicate.
      if (countAsIncome) {
        const incomeId = `transfer-income-${id}`;
        const income: Income = {
          id: incomeId,
          localId: incomeId,
          userId,
          accountId: data.toAccountId,
          amount: data.toAmount,
          currencyCode: data.toCurrency,
          description: 'Transfer from account',
          date: data.date,
          isDebt: false,
          isDebtRepayment: false,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
          syncStatus: 'pending' as SyncStatus,
          syncVersion: 0,
        };
        insertIncome(income).catch((e) =>
          console.error('Failed to insert transfer-linked income into SQLite:', e),
        );
      }

      api.createAccountTransfer({
        localId: id,
        fromAccountId: data.fromAccountId,
        fromCurrency: data.fromCurrency,
        fromAmount: data.fromAmount,
        toAccountId: data.toAccountId,
        toCurrency: data.toCurrency,
        toAmount: data.toAmount,
        exchangeRate: data.exchangeRate,
        date: data.date instanceof Date ? data.date.toISOString() : data.date,
        notes: data.notes,
        countAsIncome,
      }).catch((e) =>
        console.error('Failed to sync transfer to server:', e),
      );

      get().computeWalletSummary().then((summary) => set({ walletSummary: summary }));

      return newTransfer;
    },

    updateTransfer: (id, updates) => {
      set((state) => ({
        transfers: state.transfers.map((t) =>
          t.id === id
            ? {
                ...t,
                ...updates,
                updatedAt: new Date(),
                syncStatus: t.syncStatus === 'synced' ? ('pending' as SyncStatus) : t.syncStatus,
              }
            : t
        ),
      }));

      const updatedTransfer = get().transfers.find((t) => t.id === id);
      if (updatedTransfer) {
        updateTransferInDb(
          id,
          updates,
          updatedTransfer.updatedAt,
          updatedTransfer.syncStatus,
        ).catch((e) =>
          console.error('Failed to update transfer in SQLite:', e),
        );

        const serverIdForUpdate = updatedTransfer.serverId || id;
        api.updateAccountTransfer(serverIdForUpdate, {
          fromAmount: updates.fromAmount,
          toAmount: updates.toAmount,
          exchangeRate: updates.exchangeRate,
          date: updates.date instanceof Date ? updates.date.toISOString() : updates.date,
          notes: updates.notes,
          countAsIncome: updates.countAsIncome,
        }).catch((e) =>
          console.error('Failed to update transfer on server:', e),
        );
      }

      get().computeWalletSummary().then((summary) => set({ walletSummary: summary }));
    },

    deleteTransfer: (id) => {
      const transfer = get().transfers.find((t) => t.id === id);

      set((state) => ({
        transfers: state.transfers.filter((t) => t.id !== id),
      }));

      softDeleteTransfer(id, new Date()).catch((e) =>
        console.error('Failed to delete transfer from SQLite:', e),
      );

      // Also soft-delete the linked income if this transfer was counted as income
      if (transfer?.countAsIncome && transfer?.linkedIncomeId) {
        softDeleteIncomeInDb(transfer.linkedIncomeId, new Date()).catch((e) =>
          console.error('Failed to delete linked income from SQLite:', e),
        );
      }

      const serverIdForDelete = transfer?.serverId || id;
      api.deleteAccountTransfer(serverIdForDelete).catch((e) =>
        console.error('Failed to delete transfer from server:', e),
      );

      get().computeWalletSummary().then((summary) => set({ walletSummary: summary }));
    },

    computeWalletSummary: async () => {
      const accountId = useAccountStore.getState().currentAccountId;
      if (!accountId) return [];

      const balances = get().walletBalances.filter((b) => !b.isDeleted);
      const expenseTotals = await getExpenseTotalsByCurrency(accountId);
      const incomeTotals = await getIncomeTotalsByCurrency(accountId);
      const { exchangedIn, exchangedOut } = await getExchangeTotals(accountId);
      const { transferredIn, transferredOut } = await getTransferTotals(accountId);

      const summary: WalletSummary[] = balances.map((wb) => {
        const totalIncomes = incomeTotals[wb.currencyCode] || 0;
        const totalExpenses = expenseTotals[wb.currencyCode] || 0;
        const totalExchangedIn = exchangedIn[wb.currencyCode] || 0;
        const totalExchangedOut = exchangedOut[wb.currencyCode] || 0;
        const totalTransferredIn = transferredIn[wb.currencyCode] || 0;
        const totalTransferredOut = transferredOut[wb.currencyCode] || 0;
        const currentBalance = wb.initialAmount + totalIncomes - totalExpenses
          + totalExchangedIn - totalExchangedOut
          + totalTransferredIn - totalTransferredOut;

        return {
          currencyCode: wb.currencyCode as Currency,
          initialAmount: wb.initialAmount,
          totalIncomes,
          totalExpenses,
          totalExchangedIn,
          totalExchangedOut,
          totalTransferredIn,
          totalTransferredOut,
          currentBalance,
        };
      });

      return summary;
    },

    getBalanceForCurrency: (currencyCode) => {
      const summary = get().walletSummary.find((s) => s.currencyCode === currencyCode);
      return summary?.currentBalance ?? 0;
    },

    reset: () => set({ walletBalances: [], exchanges: [], transfers: [], walletSummary: [], isLoading: false, error: null }),
  })),
);
