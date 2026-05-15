import { create } from 'zustand';
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
    } finally {
      useHydrationStore.setState({ isHydrating: false });
    }
  })();
  _inflight.finally(() => { _inflight = null; });
  return _inflight;
}
