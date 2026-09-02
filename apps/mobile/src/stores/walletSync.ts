/**
 * walletSync.ts — server pull/merge logic extracted from walletStore.ts's
 * `loadWallet`. Functions accept the store's (set, get) as params so they
 * share state without a circular import, mirroring expenseSync.ts.
 */
import type { WalletBalance, CurrencyExchange, AccountTransfer, WalletSummary, Currency, SyncStatus } from '@budget/shared-types';
import { loadAllWalletBalances, upsertWalletBalance } from '@/db/walletRepository';
import { loadAllExchanges, insertExchange } from '@/db/currencyExchangeRepository';
import {
  loadTransfersByAccount,
  insertTransfer,
  loadPendingTransfers,
} from '@/db/accountTransferRepository';
import { setLastSyncTime } from '@/db/syncMetadataRepository';
import { api } from '@/services/api';
import { maybeDecrypt } from '@/services/encryptionHelper';
import { useAccountStore } from './accountStore';

// Minimal store-state shape this sync logic needs from useWalletStore
interface WalletSyncState {
  walletBalances: WalletBalance[];
  exchanges: CurrencyExchange[];
  transfers: AccountTransfer[];
}

type StoreSet = (
  updater: Partial<WalletSyncState & { walletSummary: WalletSummary[] }>,
) => void;
type StoreGet = () => WalletSyncState & {
  computeWalletSummary: () => Promise<WalletSummary[]>;
};

/**
 * Pulls balances/exchanges/transfers from the server, merges them into local
 * SQLite, and refreshes in-memory state + the computed summary. Never throws
 * — a failed sync leaves the already-loaded local data in place (offline or
 * server hiccup), matching the original `loadWallet` behavior.
 */
export async function syncWalletFromServer(
  set: StoreSet,
  get: StoreGet,
  accountId: string,
): Promise<void> {
  try {
    // Collect freshly-built server rows so web (no real SQLite) can fall
    // back to them when the post-sync read-back comes up empty.
    const builtBalances: WalletBalance[] = [];
    const builtExchanges: CurrencyExchange[] = [];
    const builtTransfers: AccountTransfer[] = [];

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
        builtBalances.push(balance);
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
        builtExchanges.push(exchange);
        await insertExchange(exchange);
      }
    }

    // Sync transfers from server
    try {
      const serverTransfers = await api.getAccountTransfers();
      if (useAccountStore.getState().currentAccountId !== accountId) return;
      // A row still waiting in the write queue must NOT be overwritten by the
      // server's copy: insertTransfer is INSERT OR REPLACE, so the pull would
      // silently revert an edit made offline (the shopping-list merge guards
      // pending clientIds for the same reason).
      const pendingIds = new Set(
        (await loadPendingTransfers(accountId)).map((t) => t.id),
      );
      if (Array.isArray(serverTransfers)) {
        for (const st of serverTransfers) {
          const localId = st.clientId || st.id;
          if (pendingIds.has(localId)) continue;
          // Only store transfers relevant to current account
          if (st.fromAccountId === accountId || st.toAccountId === accountId) {
            const transfer: AccountTransfer = {
              id: localId,
              localId,
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
            builtTransfers.push(transfer);
            await insertTransfer(transfer);
          }
        }
      }
    } catch (e) {
      console.warn('Transfer server sync skipped:', e);
    }

    // Reload after server sync
    const merged = await loadAllWalletBalances(accountId);
    const mergedExchanges = await loadAllExchanges(accountId);
    const mergedTransfers = await loadTransfersByAccount(accountId);
    // Guard: abort if account switched during merge
    if (useAccountStore.getState().currentAccountId !== accountId) return;
    // Web (no real SQLite): read-back is empty — fall back to built rows.
    set({
      walletBalances: merged.length > 0 ? merged : builtBalances.filter((b) => !b.isDeleted),
      exchanges: mergedExchanges.length > 0 ? mergedExchanges : builtExchanges.filter((e) => !e.isDeleted),
      transfers: mergedTransfers.length > 0 ? mergedTransfers : builtTransfers.filter((t) => !t.isDeleted),
    });

    const updatedSummary = await get().computeWalletSummary();
    set({ walletSummary: updatedSummary });
    setLastSyncTime(Date.now());
  } catch (e) {
    console.warn('Wallet server sync skipped:', e);
  }
}
