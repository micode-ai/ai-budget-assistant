import { create } from 'zustand';
import { Platform } from 'react-native';
import { useExpenseStore } from './expenseStore';
import { useIncomeStore } from './incomeStore';
import { useAccountStore } from './accountStore';
import { createAccountScopedInflight } from './accountScopedInflight';

// Tiny store so UI can show a loading indicator while a hydrate cycle runs.
interface HydrationState {
  isHydrating: boolean;
}
export const useHydrationStore = create<HydrationState>(() => ({
  isHydrating: false,
}));

// Runs loadExpenses then loadIncomes SEQUENTIALLY. Their per-store re-entry
// guards already coalesce concurrent calls, but running them in parallel
// causes SQLite contention — both `loadAllExpenses` and `loadAllIncomes` block
// the JS thread on the single SQLite connection and inflate from ~65ms to ~300ms.
// Serializing here eliminates that overhead for the local-read phase. The
// server-pull network calls inside each are independent and don't contend.
//
// Plus our own re-entry guard so we don't kick off two hydrate chains in parallel
// even when many call sites fire at once (DatabaseProvider, authStore, tabs).
// It is per account: a hydrate requested right after an account switch must
// not join the previous account's chain (see accountScopedInflight.ts).

const _inflight = createAccountScopedInflight();

export function hydrateTransactions(opts?: { force?: boolean }): Promise<void> {
  return _inflight(useAccountStore.getState().currentAccountId, async () => {
    useHydrationStore.setState({ isHydrating: true });
    try {
      await useExpenseStore.getState().loadExpenses(opts);
      await useIncomeStore.getState().loadIncomes(opts);
      // Web: refresh the wallet figure now that transactions have changed.
      //
      // This block was originally a patch for a race — `walletSummary` used to
      // be reconstructed from these very stores, and `loadWallet` could compute
      // it before they had loaded. That reconstruction is gone on web
      // (`computeWalletSummary` asks the server instead), so what remains here
      // is the useful half: one cheap `/wallet/summary` per hydrate keeps the
      // dashboard's figure current when the user returns to it, which is the
      // only thing that re-fetches it on a revisit.
      //
      // Dynamic import avoids a static cycle (walletStore → authStore → here).
      if (Platform.OS === 'web') {
        try {
          const accountId = useAccountStore.getState().currentAccountId;
          const { useWalletStore } = await import('./walletStore');
          const summary = await useWalletStore.getState().computeWalletSummary();
          // The account may have changed while the request was out — never
          // write one account's balances over another's.
          if (useAccountStore.getState().currentAccountId === accountId) {
            useWalletStore.setState({ walletSummary: summary });
          }
        } catch { /* wallet not ready — loadWallet will fetch it */ }
      }
    } finally {
      useHydrationStore.setState({ isHydrating: false });
    }
  });
}
