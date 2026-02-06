import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Expense, Currency, SyncStatus } from '@budget/shared-types';
import { generateUUID, getStartOfMonth, getEndOfMonth } from '@budget/shared-utils';
import {
  loadAllExpenses,
  insertExpense,
  updateExpenseInDb,
  softDeleteExpenseInDb,
} from '@/db/expenseRepository';

interface ExpenseFilters {
  dateRange: 'week' | 'month' | 'year' | 'all';
  categoryId: string | null;
  searchQuery: string;
}

interface CategoryBreakdown {
  categoryId: string | null;
  name: string;
  amount: number;
  percentage: number;
  count: number;
  color?: string;
}

interface ExpenseState {
  expenses: Expense[];
  isLoading: boolean;
  error: string | null;
  filters: ExpenseFilters;

  // Computed values
  totalThisMonth: number;

  // Actions
  loadExpenses: () => Promise<void>;
  setExpenses: (expenses: Expense[]) => void;
  addExpense: (expense: Omit<Expense, 'id' | 'localId' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'syncVersion' | 'isDeleted'>) => Expense;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  setFilters: (filters: Partial<ExpenseFilters>) => void;

  // Selectors
  getFilteredExpenses: () => Expense[];
  getExpensesByCategory: () => CategoryBreakdown[];
  getTrendVsLastPeriod: () => number;
}

export const useExpenseStore = create<ExpenseState>()(
  subscribeWithSelector((set, get) => ({
    expenses: [],
    isLoading: false,
    error: null,
    filters: {
      dateRange: 'month',
      categoryId: null,
      searchQuery: '',
    },

    get totalThisMonth() {
      const now = new Date();
      const startOfMonth = getStartOfMonth(now);
      const endOfMonth = getEndOfMonth(now);

      return get().expenses
        .filter((e) => !e.isDeleted)
        .filter((e) => {
          const expenseDate = new Date(e.date);
          return expenseDate >= startOfMonth && expenseDate <= endOfMonth;
        })
        .reduce((sum, e) => sum + e.amount, 0);
    },

    loadExpenses: async () => {
      set({ isLoading: true, error: null });
      try {
        const expenses = await loadAllExpenses();
        set({ expenses, isLoading: false });
      } catch (e) {
        console.error('Failed to load expenses from SQLite:', e);
        set({ error: 'Failed to load expenses', isLoading: false });
      }
    },

    setExpenses: (expenses) => set({ expenses }),

    addExpense: (expenseData) => {
      const id = generateUUID();
      const now = new Date();

      const newExpense: Expense = {
        ...expenseData,
        id,
        localId: id,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending' as SyncStatus,
        syncVersion: 0,
        isDeleted: false,
      };

      set((state) => ({
        expenses: [newExpense, ...state.expenses],
      }));

      insertExpense(newExpense).catch((e) =>
        console.error('Failed to insert expense into SQLite:', e),
      );

      return newExpense;
    },

    updateExpense: (id, updates) => {
      set((state) => ({
        expenses: state.expenses.map((e) =>
          e.id === id
            ? {
                ...e,
                ...updates,
                updatedAt: new Date(),
                syncStatus: e.syncStatus === 'synced' ? 'pending' : e.syncStatus,
              }
            : e
        ),
      }));

      const updatedExpense = get().expenses.find((e) => e.id === id);
      if (updatedExpense) {
        updateExpenseInDb(
          id,
          updates,
          updatedExpense.updatedAt,
          updatedExpense.syncStatus,
        ).catch((e) =>
          console.error('Failed to update expense in SQLite:', e),
        );
      }
    },

    deleteExpense: (id) => {
      set((state) => ({
        expenses: state.expenses.map((e) =>
          e.id === id
            ? {
                ...e,
                isDeleted: true,
                updatedAt: new Date(),
                syncStatus: 'pending' as SyncStatus,
              }
            : e
        ),
      }));

      const deletedExpense = get().expenses.find((e) => e.id === id);
      if (deletedExpense) {
        softDeleteExpenseInDb(id, deletedExpense.updatedAt).catch((e) =>
          console.error('Failed to soft-delete expense in SQLite:', e),
        );
      }
    },

    setFilters: (filters) =>
      set((state) => ({
        filters: { ...state.filters, ...filters },
      })),

    getFilteredExpenses: () => {
      const { expenses, filters } = get();
      let filtered = expenses.filter((e) => !e.isDeleted);

      // Apply date range filter
      const now = new Date();
      if (filters.dateRange !== 'all') {
        const startDate = new Date();
        switch (filters.dateRange) {
          case 'week':
            startDate.setDate(now.getDate() - 7);
            break;
          case 'month':
            startDate.setMonth(now.getMonth() - 1);
            break;
          case 'year':
            startDate.setFullYear(now.getFullYear() - 1);
            break;
        }
        filtered = filtered.filter((e) => new Date(e.date) >= startDate);
      }

      // Apply category filter
      if (filters.categoryId) {
        filtered = filtered.filter((e) => e.categoryId === filters.categoryId);
      }

      // Apply search filter
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        filtered = filtered.filter(
          (e) =>
            e.description?.toLowerCase().includes(query) ||
            e.notes?.toLowerCase().includes(query)
        );
      }

      // Sort by date descending
      return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },

    getExpensesByCategory: () => {
      const filtered = get().getFilteredExpenses();
      const total = filtered.reduce((sum, e) => sum + e.amount, 0);

      if (total === 0) return [];

      const categoryMap = new Map<string | null, { amount: number; count: number }>();

      filtered.forEach((expense) => {
        const key = expense.categoryId || null;
        const current = categoryMap.get(key) || { amount: 0, count: 0 };
        categoryMap.set(key, {
          amount: current.amount + expense.amount,
          count: current.count + 1,
        });
      });

      const breakdown: CategoryBreakdown[] = Array.from(categoryMap.entries()).map(
        ([categoryId, data]) => ({
          categoryId,
          name: categoryId || 'Uncategorized', // TODO: Get category name from categoryStore
          amount: data.amount,
          percentage: (data.amount / total) * 100,
          count: data.count,
        })
      );

      return breakdown.sort((a, b) => b.amount - a.amount);
    },

    getTrendVsLastPeriod: () => {
      const { expenses, filters } = get();
      const now = new Date();

      let currentStart: Date;
      let currentEnd: Date;
      let previousStart: Date;
      let previousEnd: Date;

      switch (filters.dateRange) {
        case 'week':
          currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          currentEnd = now;
          previousStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
          previousEnd = currentStart;
          break;
        case 'month':
        default:
          currentStart = getStartOfMonth(now);
          currentEnd = getEndOfMonth(now);
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          previousStart = getStartOfMonth(lastMonth);
          previousEnd = getEndOfMonth(lastMonth);
          break;
        case 'year':
          currentStart = new Date(now.getFullYear(), 0, 1);
          currentEnd = now;
          previousStart = new Date(now.getFullYear() - 1, 0, 1);
          previousEnd = new Date(now.getFullYear() - 1, 11, 31);
          break;
      }

      const currentTotal = expenses
        .filter((e) => !e.isDeleted)
        .filter((e) => {
          const date = new Date(e.date);
          return date >= currentStart && date <= currentEnd;
        })
        .reduce((sum, e) => sum + e.amount, 0);

      const previousTotal = expenses
        .filter((e) => !e.isDeleted)
        .filter((e) => {
          const date = new Date(e.date);
          return date >= previousStart && date <= previousEnd;
        })
        .reduce((sum, e) => sum + e.amount, 0);

      if (previousTotal === 0) return 0;
      return ((currentTotal - previousTotal) / previousTotal) * 100;
    },
  }))
);
