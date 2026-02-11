import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Budget, BudgetProgress, BudgetPeriod, Currency, SyncStatus } from '@budget/shared-types';
import { generateUUID, getStartOfMonth, getEndOfMonth, getStartOfWeek, getEndOfWeek } from '@budget/shared-utils';
import { useExpenseStore } from './expenseStore';
import { useAccountStore } from './accountStore';
import { api } from '@/services/api';
import {
  loadAllBudgets,
  insertBudget,
  upsertBudget,
  updateBudgetInDb,
  softDeleteBudgetInDb,
  clearAllBudgets,
} from '@/db/budgetRepository';
import { setLastSyncTime } from '@/db/syncMetadataRepository';

interface BudgetState {
  budgets: Budget[];
  isLoading: boolean;
  error: string | null;

  // Computed
  activeBudgets: Budget[];

  // Actions
  loadBudgets: () => Promise<void>;
  syncPendingBudgets: () => Promise<void>;
  setBudgets: (budgets: Budget[]) => void;
  addBudget: (budget: Omit<Budget, 'id' | 'localId' | 'accountId' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'syncVersion' | 'isDeleted'>) => Budget;
  updateBudget: (id: string, updates: Partial<Budget>) => void;
  deleteBudget: (id: string) => void;

  // Selectors
  getBudgetProgress: (budgetId: string) => BudgetProgress | null;
  getTotalBudget: () => number;
  reset: () => void;
}

export const useBudgetStore = create<BudgetState>()(
  subscribeWithSelector((set, get) => ({
    budgets: [],
    isLoading: false,
    error: null,

    activeBudgets: [],

    loadBudgets: async () => {
      const accountId = useAccountStore.getState().currentAccountId;
      if (!accountId) return;

      set({ isLoading: true, error: null });
      try {
        // 1. Show local data immediately
        const localBudgets = await loadAllBudgets(accountId);
        if (useAccountStore.getState().currentAccountId !== accountId) return;
        set({ budgets: localBudgets, isLoading: false });

        // 2. Sync pending local → server
        get().syncPendingBudgets();

        // 3. Pull from server → local
        try {
          const serverBudgets = await api.getBudgets();
          if (useAccountStore.getState().currentAccountId !== accountId) return;

          if (Array.isArray(serverBudgets)) {
            for (const sb of serverBudgets) {
              const budget: Budget = {
                id: sb.clientId || sb.id,
                localId: sb.clientId || sb.id,
                serverId: sb.id,
                userId: sb.userId,
                accountId: sb.accountId,
                name: sb.name,
                amount: Number(sb.amount),
                currencyCode: (sb.currencyCode || 'USD') as Currency,
                period: sb.period as BudgetPeriod,
                startDate: new Date(sb.startDate),
                endDate: sb.endDate ? new Date(sb.endDate) : undefined,
                categoryId: sb.categoryId ?? undefined,
                alertThreshold: sb.alertThreshold ?? 80,
                isActive: sb.isActive ?? true,
                createdAt: new Date(sb.createdAt),
                updatedAt: new Date(sb.updatedAt),
                isDeleted: sb.isDeleted || false,
                syncStatus: 'synced' as SyncStatus,
                syncVersion: sb.syncVersion || 0,
              };
              await upsertBudget(budget);
            }

            // Soft-delete locally-synced budgets the server no longer returns
            const serverIdSet = new Set(serverBudgets.map((sb: any) => sb.clientId || sb.id));
            for (const local of localBudgets) {
              if (local.syncStatus === 'synced' && !serverIdSet.has(local.id)) {
                await softDeleteBudgetInDb(local.id, new Date());
              }
            }

            // Reload merged data from SQLite
            const merged = await loadAllBudgets(accountId);
            if (useAccountStore.getState().currentAccountId !== accountId) return;
            set({ budgets: merged });

            setLastSyncTime(Date.now());
          }
        } catch (e) {
          console.log('Budget server sync skipped:', e);
        }
      } catch (e) {
        console.error('Failed to load budgets from SQLite:', e);
        set({ error: 'Failed to load budgets', isLoading: false });
      }
    },

    syncPendingBudgets: async () => {
      const pending = get().budgets.filter(
        (b) => b.syncStatus === 'pending' && !b.isDeleted,
      );
      if (pending.length === 0) return;

      for (const budget of pending) {
        try {
          await api.createBudget({
            localId: budget.localId || budget.id,
            name: budget.name,
            amount: budget.amount,
            currencyCode: budget.currencyCode,
            period: budget.period,
            startDate: budget.startDate instanceof Date ? budget.startDate.toISOString() : budget.startDate,
            endDate: budget.endDate instanceof Date ? budget.endDate.toISOString() : budget.endDate,
            categoryId: budget.categoryId,
            alertThreshold: budget.alertThreshold,
          });
          set((state) => ({
            budgets: state.budgets.map((b) =>
              b.id === budget.id ? { ...b, syncStatus: 'synced' as SyncStatus } : b,
            ),
          }));
          updateBudgetInDb(budget.id, {}, new Date(), 'synced').catch(() => {});
        } catch {
          // Server unavailable — will retry on next load
        }
      }
    },

    setBudgets: (budgets) => set({ budgets }),

    addBudget: (budgetData) => {
      const id = generateUUID();
      const now = new Date();
      const accountId = useAccountStore.getState().currentAccountId || '';

      const newBudget: Budget = {
        ...budgetData,
        id,
        localId: id,
        accountId,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending' as SyncStatus,
        syncVersion: 0,
        isDeleted: false,
      };

      set((state) => ({
        budgets: [newBudget, ...state.budgets],
      }));

      // Persist to local SQLite
      insertBudget(newBudget).catch((e) =>
        console.error('Failed to insert budget in SQLite:', e),
      );

      // Sync to server
      api.createBudget({
        localId: id,
        name: budgetData.name,
        amount: budgetData.amount,
        currencyCode: budgetData.currencyCode,
        period: budgetData.period,
        startDate: budgetData.startDate instanceof Date ? budgetData.startDate.toISOString() : budgetData.startDate,
        endDate: budgetData.endDate instanceof Date ? budgetData.endDate.toISOString() : budgetData.endDate,
        categoryId: budgetData.categoryId,
        alertThreshold: budgetData.alertThreshold,
      }).then(() => {
        set((state) => ({
          budgets: state.budgets.map((b) =>
            b.id === id ? { ...b, syncStatus: 'synced' as SyncStatus } : b,
          ),
        }));
        updateBudgetInDb(id, {}, new Date(), 'synced').catch(() => {});
      }).catch((e) =>
        console.error('Failed to sync budget to server:', e),
      );

      return newBudget;
    },

    updateBudget: (id, updates) => {
      set((state) => ({
        budgets: state.budgets.map((b) =>
          b.id === id
            ? {
                ...b,
                ...updates,
                updatedAt: new Date(),
                syncStatus: b.syncStatus === 'synced' ? 'pending' : b.syncStatus,
              }
            : b
        ),
      }));

      // Persist to local SQLite
      const budget = get().budgets.find((b) => b.id === id);
      if (budget) {
        updateBudgetInDb(id, updates, budget.updatedAt, budget.syncStatus).catch((e) =>
          console.error('Failed to update budget in SQLite:', e),
        );
      }

      // Sync to server
      if (budget?.serverId) {
        api.updateBudget(budget.serverId, updates).catch((e) =>
          console.error('Failed to sync budget update to server:', e),
        );
      }
    },

    deleteBudget: (id) => {
      const budget = get().budgets.find((b) => b.id === id);

      set((state) => ({
        budgets: state.budgets.map((b) =>
          b.id === id
            ? {
                ...b,
                isDeleted: true,
                updatedAt: new Date(),
                syncStatus: 'pending' as SyncStatus,
              }
            : b
        ),
      }));

      // Persist to local SQLite
      softDeleteBudgetInDb(id, new Date()).catch((e) =>
        console.error('Failed to soft-delete budget in SQLite:', e),
      );

      // Sync to server
      if (budget?.serverId) {
        api.deleteBudget(budget.serverId).catch((e) =>
          console.error('Failed to sync budget deletion to server:', e),
        );
      }
    },

    getBudgetProgress: (budgetId: string): BudgetProgress | null => {
      const budget = get().budgets.find((b) => b.id === budgetId);
      if (!budget || budget.isDeleted) return null;

      const expenses = useExpenseStore.getState().expenses.filter((e) => !e.isDeleted);

      // Get period dates
      let periodStart: Date;
      let periodEnd: Date;
      const now = new Date();

      switch (budget.period) {
        case 'daily':
          periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
          break;
        case 'weekly':
          periodStart = getStartOfWeek(now);
          periodEnd = getEndOfWeek(now);
          break;
        case 'monthly':
          periodStart = getStartOfMonth(now);
          periodEnd = getEndOfMonth(now);
          break;
        case 'yearly':
          periodStart = new Date(now.getFullYear(), 0, 1);
          periodEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
          break;
        case 'custom':
          periodStart = new Date(budget.startDate);
          periodEnd = budget.endDate ? new Date(budget.endDate) : now;
          break;
        default:
          periodStart = getStartOfMonth(now);
          periodEnd = getEndOfMonth(now);
      }

      // Filter expenses for this budget period and matching currency
      let periodExpenses = expenses.filter((e) => {
        const expenseDate = new Date(e.date);
        return expenseDate >= periodStart && expenseDate <= periodEnd;
      });

      // Filter by currency to match budget currency
      periodExpenses = periodExpenses.filter((e) => e.currencyCode === budget.currencyCode);

      // Filter by category if budget is category-specific
      if (budget.categoryId) {
        periodExpenses = periodExpenses.filter((e) => e.categoryId === budget.categoryId);
      }

      const spent = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
      const remaining = Math.max(0, budget.amount - spent);
      const percentageUsed = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
      const isOverBudget = spent > budget.amount;

      // Calculate days remaining
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysRemaining = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / msPerDay));

      // Project total spending
      const daysPassed = Math.max(1, Math.ceil((now.getTime() - periodStart.getTime()) / msPerDay));
      const dailyAverage = spent / daysPassed;
      const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / msPerDay);
      const projectedTotal = dailyAverage * totalDays;

      const dailyBurnRate = dailyAverage;

      // Estimate exhaustion date
      let estimatedExhaustionDate: Date | undefined;
      if (dailyBurnRate > 0 && !isOverBudget) {
        const daysUntilExhaustion = remaining / dailyBurnRate;
        const exhaustionDate = new Date(now.getTime() + daysUntilExhaustion * msPerDay);
        if (exhaustionDate <= periodEnd) {
          estimatedExhaustionDate = exhaustionDate;
        }
      }

      return {
        budget,
        spent,
        remaining,
        percentageUsed,
        isOverBudget,
        daysRemaining,
        projectedTotal,
        dailyBurnRate,
        estimatedExhaustionDate,
      };
    },

    getTotalBudget: () => {
      const activeBudgets = get().budgets.filter((b) => b.isActive && !b.isDeleted);
      const accountCurrency = useAccountStore.getState().currentAccount()?.currencyCode || 'USD';

      // Only sum budgets matching the account's default currency
      const sameCurrencyBudgets = activeBudgets.filter((b) => b.currencyCode === accountCurrency);

      // Find overall budget (no category) or sum category budgets
      const overallBudget = sameCurrencyBudgets.find((b) => !b.categoryId && b.period === 'monthly');

      if (overallBudget) {
        return overallBudget.amount;
      }

      // Sum all monthly category budgets in the same currency
      return sameCurrencyBudgets
        .filter((b) => b.period === 'monthly')
        .reduce((sum, b) => sum + b.amount, 0);
    },

    reset: () => {
      clearAllBudgets().catch(() => {});
      set({ budgets: [], activeBudgets: [], isLoading: false, error: null });
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
