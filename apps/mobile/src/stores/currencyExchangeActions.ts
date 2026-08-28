/**
 * currencyExchangeActions.ts — currency-exchange CRUD logic extracted from
 * walletStore.ts. Functions accept the store's (set, get) as params so they
 * share state without a circular import, mirroring expenseSync.ts.
 */
import type { CurrencyExchange, WalletSummary, SyncStatus } from '@budget/shared-types';
import { generateUUID } from '@budget/shared-utils';
import {
  insertExchange,
  updateExchangeInDb,
  softDeleteExchange,
} from '@/db/currencyExchangeRepository';
import { api } from '@/services/api';
import { maybeEncrypt } from '@/services/encryptionHelper';
import { useAccountStore } from './accountStore';
import { useAuthStore } from './authStore';

// Minimal store-state shape these actions need from useWalletStore
interface ExchangeActionState {
  exchanges: CurrencyExchange[];
}

type StoreSet = (
  updater:
    | Partial<ExchangeActionState & { walletSummary: WalletSummary[] }>
    | ((state: ExchangeActionState) => Partial<ExchangeActionState>),
) => void;
type StoreGet = () => ExchangeActionState & {
  computeWalletSummary: () => Promise<WalletSummary[]>;
};

export function addExchangeAction(
  set: StoreSet,
  get: StoreGet,
  data: {
    fromCurrency: CurrencyExchange['fromCurrency'];
    toCurrency: CurrencyExchange['toCurrency'];
    fromAmount: number;
    toAmount: number;
    exchangeRate: number;
    date: Date;
    notes?: string;
  },
): CurrencyExchange {
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
}

export function updateExchangeAction(
  set: StoreSet,
  get: StoreGet,
  id: string,
  updates: Partial<CurrencyExchange>,
): void {
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
}

export function deleteExchangeAction(set: StoreSet, get: StoreGet, id: string): void {
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
}
