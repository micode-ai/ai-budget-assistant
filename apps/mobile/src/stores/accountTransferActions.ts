/**
 * accountTransferActions.ts — account-transfer CRUD logic extracted from
 * walletStore.ts. Functions accept the store's (set, get) as params so they
 * share state without a circular import, mirroring expenseSync.ts.
 */
import type { AccountTransfer, Income, WalletSummary, SyncStatus } from '@budget/shared-types';
import { generateUUID } from '@budget/shared-utils';
import {
  insertTransfer,
  updateTransferInDb,
  softDeleteTransfer,
} from '@/db/accountTransferRepository';
import { insertIncome, softDeleteIncomeInDb } from '@/db/incomeRepository';
import { api } from '@/services/api';
import { useAuthStore } from './authStore';

// Minimal store-state shape these actions need from useWalletStore
interface TransferActionState {
  transfers: AccountTransfer[];
}

type StoreSet = (
  updater:
    | Partial<TransferActionState & { walletSummary: WalletSummary[] }>
    | ((state: TransferActionState) => Partial<TransferActionState>),
) => void;
type StoreGet = () => TransferActionState & {
  computeWalletSummary: () => Promise<WalletSummary[]>;
};

export function addTransferAction(
  set: StoreSet,
  get: StoreGet,
  data: {
    fromAccountId: string;
    fromCurrency: AccountTransfer['fromCurrency'];
    fromAmount: number;
    toAccountId: string;
    toCurrency: AccountTransfer['toCurrency'];
    toAmount: number;
    exchangeRate: number;
    date: Date;
    notes?: string;
    countAsIncome?: boolean;
  },
): AccountTransfer {
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
      source: 'manual',
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
}

export function updateTransferAction(
  set: StoreSet,
  get: StoreGet,
  id: string,
  updates: Partial<AccountTransfer>,
): void {
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
      fromAccountId: updates.fromAccountId,
      toAccountId: updates.toAccountId,
      fromCurrency: updates.fromCurrency,
      toCurrency: updates.toCurrency,
      fromAmount: updates.fromAmount,
      toAmount: updates.toAmount,
      exchangeRate: updates.exchangeRate,
      date: updates.date instanceof Date ? updates.date.toISOString() : updates.date,
      notes: updates.notes,
      countAsIncome: updates.countAsIncome,
    }).catch((e) =>
      // Expected while offline: the row stays `pending` and re-syncs later.
      // console.error would raise a full-screen LogBox overlay (ABA-157).
      console.warn('Failed to update transfer on server:', e),
    );
  }

  get().computeWalletSummary().then((summary) => set({ walletSummary: summary }));
}

export function deleteTransferAction(set: StoreSet, get: StoreGet, id: string): void {
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
}
