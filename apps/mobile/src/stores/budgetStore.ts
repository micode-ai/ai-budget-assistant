import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Budget, BudgetProgress, BudgetPeriod, Currency, SyncStatus } from '@budget/shared-types';
import { generateUUID, getStartOfMonth, getEndOfMonth, getStartOfWeek, getEndOfWeek } from '@budget/shared-utils';
import { useExpenseStore } from './expenseStore';

interface BudgetState {
  budgets: Budget[];
  isLoading: boolean;
  error: string | null;

  // Computed
  activeBudgets: Budget[];

  // Actions
  setBudgets: (budgets: Budget[]) => void;
  addBudget: (budget: Omit<Budget, 'id' | 'localId' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'syncVersion' | 'isDeleted'>) => Budget;
  updateBudget: (id: string, updates: Partial<Budget>) => void;
  deleteBudget: (id: string) => void;

  // Selectors
  getBudgetProgress: (budgetId: string) => BudgetProgress | null;
  getTotalBudget: () => number;
}

export const useBudgetStore = create<BudgetState>()(
  subscribeWithSelector((set, get) => ({
    budgets: [],
    isLoading: false,
    error: null,

    get activeBudgets() {
      return get().budgets.filter((b) => b.isActive && !b.isDeleted);
    },

    setBudgets: (budgets) => set({ budgets }),

    addBudget: (budgetData) => {
      const id = generateUUID();
      const now = new Date();

      const newBudget: Budget = {
        ...budgetData,
        id,
        localId: id,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending' as SyncStatus,
        syncVersion: 0,
        isDeleted: false,
      };

      set((state) => ({
        budgets: [newBudget, ...state.budgets],
      }));

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
    },

    deleteBudget: (id) => {
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

      // Filter expenses for this budget period
      let periodExpenses = expenses.filter((e) => {
        const expenseDate = new Date(e.date);
        return expenseDate >= periodStart && expenseDate <= periodEnd;
      });

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

      return {
        budget,
        spent,
        remaining,
        percentageUsed,
        isOverBudget,
        daysRemaining,
        projectedTotal,
      };
    },

    getTotalBudget: () => {
      const activeBudgets = get().budgets.filter((b) => b.isActive && !b.isDeleted);

      // Find overall budget (no category) or sum category budgets
      const overallBudget = activeBudgets.find((b) => !b.categoryId && b.period === 'monthly');

      if (overallBudget) {
        return overallBudget.amount;
      }

      // Sum all monthly category budgets
      return activeBudgets
        .filter((b) => b.period === 'monthly')
        .reduce((sum, b) => sum + b.amount, 0);
    },
  }))
);
