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
  setTransferSyncStatus,
  loadPendingTransfers,
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
 * Outcome of a transfer write.
 *
 * - `saved`    — the server accepted it.
 * - `queued`   — the request never reached the server (offline). The edit stays
 *                applied locally with `sync_status = 'pending'` and
 *                `syncPendingTransfers` retries it; the wallet pull skips pending
 *                rows so it cannot be clobbered in the meantime.
 * - `rejected` — the server refused it (4xx). Retrying would never help, so the row
 *                is restored in memory and on disk and the caller must say so.
 *                Leaving a refused edit applied is what made a rejected re-home look
 *                saved and then silently revert on the next pull.
 */
export type TransferWriteResult = { status: 'saved' | 'queued' | 'rejected' };

/**
 * A 4xx means "this will never be accepted" (no membership, viewer, gone), as
 * opposed to a transport failure, which is worth retrying. `HttpClient` puts the
 * HTTP status on the error; a fetch that never got a response has none.
 */
function isPermanentRejection(e: unknown): boolean {
  const status = (e as { status?: number } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

function httpStatus(e: unknown): number | undefined {
  return (e as { status?: number } | null)?.status;
}

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
  if (!previous) return { status: 'rejected' };

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
    console.warn('Failed to update transfer on server:', e);
    if (!isPermanentRejection(e)) {
      // Offline: keep the edit, keep the row pending, let the queue retry it. The
      // wallet pull skips pending rows, so the server's older copy cannot overwrite
      // it while it waits.
      return { status: 'queued' };
    }
    // Refused for good — put the row back exactly as it was, in memory and on disk.
    set((state) => ({ transfers: state.transfers.map((t) => (t.id === id ? previous : t)) }));
    const rollback: Partial<AccountTransfer> = {};
    for (const key of Object.keys(updates) as (keyof AccountTransfer)[]) {
      (rollback as Record<string, unknown>)[key] = previous[key];
    }
    await updateTransferInDb(id, rollback, previous.updatedAt, previous.syncStatus).catch((err) =>
      console.error('Failed to roll back transfer in SQLite:', err),
    );
    void refreshSummary();
    return { status: 'rejected' };
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
  return { status: 'saved' };
}

/**
 * Pushes the account's queued transfer writes. Transfers do not go through the
 * generic /sync machinery, and before this they had no sweeper at all: a write that
 * failed was simply lost, because `sync_status = 'pending'` was written and read by
 * nothing. Called from `loadWallet` before the server pull, mirroring how
 * `loadIncomes` calls `syncPendingIncomes`.
 *
 * Never throws. Scoped to `accountId` because the push travels under that
 * `X-Account-Id` and the server refuses a transfer the acting account is not a
 * party to.
 */
export async function syncPendingTransfersAction(
  set: StoreSet,
  get: StoreGet,
  accountId: string,
): Promise<void> {
  let pending: AccountTransfer[];
  try {
    pending = await loadPendingTransfers(accountId);
  } catch (e) {
    console.warn('Failed to read the pending transfer queue:', e);
    return;
  }
  if (pending.length === 0) return;

  const markSynced = async (t: AccountTransfer) => {
    await setTransferSyncStatus(t.id, 'synced').catch((e) =>
      console.warn('Failed to mark transfer synced:', e),
    );
    set((state) => ({
      transfers: state.transfers.map((row) =>
        row.id === t.id ? { ...row, syncStatus: 'synced' as SyncStatus } : row,
      ),
    }));
  };

  let pushed = false;

  for (const t of pending) {
    try {
      if (t.isDeleted) {
        await api.deleteAccountTransfer(t.serverId || t.id);
      } else if (!t.serverId) {
        // The server create is idempotent on localId, so re-sending one whose
        // response was lost returns the existing row instead of a duplicate.
        const created = await api.createAccountTransfer({
          localId: t.localId || t.id,
          fromAccountId: t.fromAccountId,
          fromCurrency: t.fromCurrency,
          fromAmount: t.fromAmount,
          toAccountId: t.toAccountId,
          toCurrency: t.toCurrency,
          toAmount: t.toAmount,
          exchangeRate: t.exchangeRate,
          date: t.date instanceof Date ? t.date.toISOString() : String(t.date),
          notes: t.notes,
          countAsIncome: t.countAsIncome,
        });
        if (created?.id) {
          await setTransferServerId(t.id, created.id).catch((e) =>
            console.warn('Failed to store transfer server id:', e),
          );
          set((state) => ({
            transfers: state.transfers.map((row) =>
              row.id === t.id ? { ...row, serverId: created.id } : row,
            ),
          }));
        }
      } else {
        await api.updateAccountTransfer(t.serverId, {
          fromAccountId: t.fromAccountId,
          toAccountId: t.toAccountId,
          fromCurrency: t.fromCurrency,
          toCurrency: t.toCurrency,
          fromAmount: t.fromAmount,
          toAmount: t.toAmount,
          exchangeRate: t.exchangeRate,
          date: t.date instanceof Date ? t.date.toISOString() : String(t.date),
          notes: t.notes,
          countAsIncome: t.countAsIncome,
        });
      }
      await markSynced(t);
      pushed = true;
    } catch (e) {
      // A delete whose row is already gone server-side is done, not failed.
      if (t.isDeleted && httpStatus(e) === 404) {
        await markSynced(t);
        pushed = true;
        continue;
      }
      if (isPermanentRejection(e)) {
        // Retrying is pointless. Marking it `error` takes it out of the queue AND
        // out of the pull's pending-guard, so the next pull overwrites it with the
        // server's truth instead of leaving a local row nothing will ever accept.
        console.warn('Queued transfer write refused, giving up on it:', e);
        await setTransferSyncStatus(t.id, 'error').catch(() => undefined);
        continue;
      }
      // Offline: every later row would fail the same way. Stop and retry next load.
      console.warn('Transfer queue push deferred (offline?):', e);
      break;
    }
  }

  if (pushed) {
    const summary = await get().computeWalletSummary();
    set({ walletSummary: summary });
  }
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
    // The row stays soft-deleted and pending; syncPendingTransfers retries it.
    // console.error would raise a full-screen LogBox overlay (ABA-157).
    console.warn('Failed to delete transfer from server:', e),
  );

  get().computeWalletSummary().then((summary) => set({ walletSummary: summary }));
}
