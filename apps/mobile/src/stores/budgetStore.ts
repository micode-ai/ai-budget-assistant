import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Budget, BudgetProgress, BudgetHistoryEntry } from '@budget/shared-types';
import { useAccountStore } from './accountStore';
import {
  loadAllBudgets,
  clearAllBudgets,
} from '@/db/budgetRepository';
import {
  getAllocationsForBudget,
  clearAllBudgetCategories,
} from '@/db/budgetCategoryRepository';
import {
  addBudgetAction,
  updateBudgetAction,
  deleteBudgetAction,
} from './budgetCrudActions';
import {
  syncPendingBudgetsAction,
  syncBudgetsFromServer,
  loadBudgetHistoryAction,
} from './budgetSync';
import {
  computeBudgetProgress,
  computeMonthlyBudgetSummary,
  type MonthlyBudgetSummary,
} from './budgetProgress';

interface BudgetState {
  budgets: Budget[];
  isLoading: boolean;
  error: string | null;
  /**
   * When the SERVER last answered, or `null` if it never has this session.
   *
   * Mirrors `expenseStore`/`incomeStore`/`walletStore`. It exists so a caller
   * can tell "this account genuinely has no budgets" from "the pull failed and
   * the store is empty" — indistinguishable otherwise on web, where the local
   * read is always `[]`. That ambiguity is what left the dashboard's budget
   * widget missing until a full page reload: the pull failed once at startup
   * and nothing ever retried it.
   */
  lastPullAt: number | null;
  budgetHistory: Record<string, BudgetHistoryEntry[]>;

  // Computed
  activeBudgets: Budget[];

  // Actions
  loadBudgets: () => Promise<void>;
  syncPendingBudgets: () => Promise<void>;
  setBudgets: (budgets: Budget[]) => void;
  addBudget: (budget: Omit<Budget, 'id' | 'localId' | 'accountId' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'syncVersion' | 'isDeleted'>) => Budget;
  updateBudget: (id: string, updates: Partial<Budget>) => void;
  deleteBudget: (id: string) => void;
  loadBudgetHistory: (budgetId: string, periods?: number) => Promise<void>;

  // Selectors
  getBudgetProgress: (budgetId: string, referenceDate?: Date) => BudgetProgress | null;
  getMonthlyBudgetSummary: () => MonthlyBudgetSummary;
  reset: () => void;
}

// This store is deliberately kept as a single Zustand hook so the many mobile
// screens/hooks that already depend on `useBudgetStore`'s shape don't need to
// change (see docs/tech-debt/budget-store-mixes-crud-sync-and-progress.md).
// What moved out is the *logic*, not the state: CRUD lives in
// budgetCrudActions.ts, the server-pull/merge + history fetch live in
// budgetSync.ts, and the progress/projection computations live in
// budgetProgress.ts (pure functions over a `budgets` array — no `set`/`get`
// needed, since they never mutate state) — this file wires them to
// `set`/`get` and keeps only the cross-cutting orchestration (`loadBudgets`),
// mirroring how walletStore.ts / authStore.ts delegate to their own split
// modules.
export const useBudgetStore = create<BudgetState>()(
  subscribeWithSelector((set, get) => ({
    budgets: [],
    isLoading: false,
    error: null,
    lastPullAt: null,
    budgetHistory: {},

    activeBudgets: [],

    loadBudgets: async () => {
      const accountId = useAccountStore.getState().currentAccountId;
      if (!accountId) return;

      set({ isLoading: true, error: null });
      try {
        // 1. Show local data immediately
        const localBudgets = await loadAllBudgets(accountId);
        if (useAccountStore.getState().currentAccountId !== accountId) return;

        // Load allocations for each budget
        for (const budget of localBudgets) {
          const allocs = await getAllocationsForBudget(budget.id);
          if (allocs.length > 0) {
            budget.categoryAllocations = allocs;
          }
        }

        // Local data is available for the UI to render immediately, but
        // `isLoading` stays true a little longer — until the server phase
        // below settles too. On web `db/client.web.ts` is an in-memory mock
        // that always resolves this local read as `[]`, so clearing
        // isLoading right here (as this store used to) let the two
        // consumers below the empty-vs-loading check — `app/budget/[id].tsx`
        // and `useBudgetsScreenData.ts` (feeding `BudgetsMobile`'s "no
        // budgets yet" empty state) — read an empty list as "there really
        // are no budgets" before the server had a chance to answer.
        set({ budgets: localBudgets });

        // 2. Sync pending local → server
        get().syncPendingBudgets();

        // 3. Pull from server → local. Never throws — a failed pull leaves
        // the local data already set above in place.
        await syncBudgetsFromServer(set, get, accountId, localBudgets);

        // Server phase settled (either branch above) — safe to clear now.
        set({ isLoading: false });
      } catch (e) {
        console.error('Failed to load budgets from SQLite:', e);
        set({ error: 'Failed to load budgets', isLoading: false });
      }
    },

    syncPendingBudgets: () => syncPendingBudgetsAction(set, get),

    setBudgets: (budgets) => set({ budgets }),

    addBudget: (budgetData) => addBudgetAction(set, get, budgetData),
    updateBudget: (id, updates) => updateBudgetAction(set, get, id, updates),
    deleteBudget: (id) => deleteBudgetAction(set, get, id),

    loadBudgetHistory: (budgetId, periods = 6) => loadBudgetHistoryAction(set, budgetId, periods),

    getBudgetProgress: (budgetId, referenceDate) =>
      computeBudgetProgress(get().budgets, budgetId, referenceDate),
    getMonthlyBudgetSummary: () => computeMonthlyBudgetSummary(get().budgets),

    reset: () => {
      clearAllBudgets().catch(() => {});
      clearAllBudgetCategories().catch(() => {});
      set({ budgets: [], activeBudgets: [], isLoading: false, error: null, budgetHistory: {}, lastPullAt: null });
    },
  }))
);

// Auto-recompute activeBudgets whenever budgets change
useBudgetStore.subscribe(
  (s) => s.budgets,
  (budgets) => {
    const accountId = useAccountStore.getState().currentAccountId;
    const activeBudgets = budgets.filter((b) => b.isActive && !b.isDeleted && b.accountId === accountId);
    useBudgetStore.setState({ activeBudgets });
  },
);
