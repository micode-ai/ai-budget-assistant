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
  setTransferServerId,
} from '@/db/accountTransferRepository';
import {
  insertIncome,
  softDeleteIncomeInDb,
  moveIncomeAccountInDb,
} from '@/db/incomeRepository';
import { api } from '@/services/api';
import { useAuthStore } from './authStore';
import { useIncomeStore } from './incomeStore';

/**
 * Outcome of a transfer write. A transfer has NO pending-sync sweeper (unlike
 * expenses' syncPendingExpenses), so an edit the server did not accept is not
 * "queued for later" — the next wallet pull's INSERT OR REPLACE overwrites it with
 * the server row and the edit is gone. That is how a rejected re-home vanished with
 * no error at all. So a failed write is rolled back and reported, and the caller is
 * expected to tell the user.
 */
export type TransferWriteResult = { ok: true } | { ok: false };

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
  })
    .then((created) => {
      // Keep the server PK. Discarding it left `serverId` undefined until some later
      // wallet pull backfilled it, so an edit made in that window was addressed by
      // the local id (ABA-339, same defect expenses had).
      if (!created?.id) return;
      set((state) => ({
        transfers: state.transfers.map((t) =>
          t.id === id ? { ...t, serverId: created.id } : t,
        ),
      }));
      return setTransferServerId(id, created.id);
    })
    // Expected while offline — console.error would raise a full-screen LogBox
    // overlay (ABA-157).
    .catch((e) => console.warn('Failed to sync transfer to server:', e));

  get().computeWalletSummary().then((summary) => set({ walletSummary: summary }));

  return newTransfer;
}

export async function updateTransferAction(
  set: StoreSet,
  get: StoreGet,
  id: string,
  updates: Partial<AccountTransfer>,
): Promise<TransferWriteResult> {
  const previous = get().transfers.find((t) => t.id === id);
  if (!previous) return { ok: false };

  const now = new Date();

  set((state) => ({
    transfers: state.transfers.map((t) =>
      t.id === id
        ? {
            ...t,
            ...updates,
            updatedAt: now,
            syncStatus: t.syncStatus === 'synced' ? ('pending' as SyncStatus) : t.syncStatus,
          }
        : t
    ),
  }));

  const refreshSummary = () =>
    get().computeWalletSummary().then((summary) => set({ walletSummary: summary }));

  await updateTransferInDb(id, updates, now, 'pending').catch((e) =>
    console.error('Failed to update transfer in SQLite:', e),
  );
  void refreshSummary();

  try {
    await api.updateAccountTransfer(previous.serverId || id, {
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
    });
  } catch (e) {
    // Put the row back exactly as it was, in memory and on disk, and let the caller
    // say so. Leaving the edit applied looked like it worked and then reverted
    // itself on the next pull, with the money never moving.
    console.warn('Failed to update transfer on server:', e);
    set((state) => ({ transfers: state.transfers.map((t) => (t.id === id ? previous : t)) }));
    const rollback: Partial<AccountTransfer> = {};
    for (const key of Object.keys(updates) as (keyof AccountTransfer)[]) {
      (rollback as Record<string, unknown>)[key] = previous[key];
    }
    await updateTransferInDb(id, rollback, previous.updatedAt, previous.syncStatus).catch((err) =>
      console.error('Failed to roll back transfer in SQLite:', err),
    );
    void refreshSummary();
    return { ok: false };
  }

  set((state) => ({
    transfers: state.transfers.map((t) =>
      t.id === id ? { ...t, syncStatus: 'synced' as SyncStatus } : t,
    ),
  }));
  await updateTransferInDb(id, updates, now, 'synced').catch((e) =>
    console.error('Failed to mark transfer synced in SQLite:', e),
  );

  // The money itself rides on the linked income, which lives on the RECEIVING
  // account. The server has already moved it; mirror that locally or the amount
  // keeps counting towards the old account's balance and never shows up on the new
  // one until both accounts happen to pull their incomes.
  const nextToAccountId = updates.toAccountId;
  const countsAsIncome = updates.countAsIncome ?? previous.countAsIncome;
  if (nextToAccountId && nextToAccountId !== previous.toAccountId && countsAsIncome) {
    const localIncomeId = `transfer-income-${previous.localId || id}`;
    await moveIncomeAccountInDb(localIncomeId, nextToAccountId).catch((e) =>
      console.warn('Failed to re-home transfer-linked income locally:', e),
    );
    void useIncomeStore
      .getState()
      .loadIncomes({ force: true })
      .catch((e) => console.warn('Failed to refresh incomes after transfer re-home:', e));
  }

  await refreshSummary();
  return { ok: true };
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
