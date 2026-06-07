import { create } from 'zustand';
import { Platform } from 'react-native';
import { useExpenseStore } from './expenseStore';
import { useIncomeStore } from './incomeStore';

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

let _inflight: Promise<void> | null = null;

export function hydrateTransactions(opts?: { force?: boolean }): Promise<void> {
  if (_inflight) return _inflight;

  _inflight = (async () => {
    useHydrationStore.setState({ isHydrating: true });
    try {
      await useExpenseStore.getState().loadExpenses(opts);
      await useIncomeStore.getState().loadIncomes(opts);
      // Web: walletSummary is derived from these in-memory stores (SQLite is a
      // no-op there), and loadWallet may have computed it before transactions
      // loaded — recompute now so NetCapital reflects actual transactions.
      // Dynamic import avoids a static cycle (walletStore → authStore → here).
      if (Platform.OS === 'web') {
        try {
          const { useWalletStore } = await import('./walletStore');
          const summary = await useWalletStore.getState().computeWalletSummary();
          useWalletStore.setState({ walletSummary: summary });
        } catch { /* wallet not ready — loadWallet will compute it */ }
      }
    } finally {
      useHydrationStore.setState({ isHydrating: false });
    }
  })();
  _inflight.finally(() => { _inflight = null; });
  return _inflight;
}
