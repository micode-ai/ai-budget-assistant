/**
 * walletBalanceActions.ts — wallet-balance CRUD logic extracted from
 * walletStore.ts. Functions accept the store's (set, get) as params so they
 * share state without a circular import, mirroring expenseSync.ts.
 */
import type { WalletBalance, WalletSummary, Currency, SyncStatus } from '@budget/shared-types';
import { generateUUID } from '@budget/shared-utils';
import { upsertWalletBalance, softDeleteWalletBalance } from '@/db/walletRepository';
import { api } from '@/services/api';
import { maybeEncrypt } from '@/services/encryptionHelper';
import { useAccountStore } from './accountStore';
import { useAuthStore } from './authStore';

// Minimal store-state shape these actions need from useWalletStore
interface BalanceActionState {
  walletBalances: WalletBalance[];
}

type StoreSet = (
  updater:
    | Partial<BalanceActionState & { walletSummary: WalletSummary[] }>
    | ((state: BalanceActionState) => Partial<BalanceActionState>),
) => void;
type StoreGet = () => BalanceActionState & {
  computeWalletSummary: () => Promise<WalletSummary[]>;
};

export function setInitialBalanceAction(
  set: StoreSet,
  get: StoreGet,
  currencyCode: Currency,
  amount: number,
): WalletBalance {
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
}

export function updateInitialBalanceAction(
  set: StoreSet,
  get: StoreGet,
  id: string,
  amount: number,
): void {
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
}

export function removeBalanceAction(set: StoreSet, get: StoreGet, id: string): void {
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
}
