import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Expense, ExpenseItem, Currency, SyncStatus } from '@budget/shared-types';
import { generateUUID, getStartOfMonth, getEndOfMonth } from '@budget/shared-utils';
import {
  loadAllExpenses,
  insertExpense,
  upsertExpense,
  updateExpenseInDb,
  softDeleteExpenseInDb,
  saveReceiptImageLocally,
  getReceiptImageFromDb,
  deleteReceiptImageLocally,
} from '@/db/expenseRepository';
import {
  loadItemsByExpenseId,
  insertExpenseItems,
  insertExpenseItem,
  updateExpenseItemInDb,
  softDeleteExpenseItemInDb,
} from '@/db/expenseItemRepository';
import { api } from '@/services/api';
import { useAccountStore } from './accountStore';

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
  expenseItems: Record<string, ExpenseItem[]>;

  // Computed values
  totalThisMonth: number;

  // Actions
  loadExpenses: () => Promise<void>;
  setExpenses: (expenses: Expense[]) => void;
  addExpense: (expense: Omit<Expense, 'id' | 'localId' | 'accountId' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'syncVersion' | 'isDeleted'> & { items?: Array<{ description: string; quantity?: number; unitPrice?: number; totalPrice: number; sortOrder?: number }>; receiptImageBase64?: string }) => Expense;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  setFilters: (filters: Partial<ExpenseFilters>) => void;

  // Expense Items actions
  loadExpenseItems: (expenseId: string) => Promise<ExpenseItem[]>;
  addExpenseItem: (expenseId: string, itemData: { description: string; quantity: number; unitPrice: number; totalPrice: number; sortOrder: number }) => ExpenseItem;
  updateExpenseItem: (expenseId: string, itemId: string, updates: Partial<ExpenseItem>) => void;
  deleteExpenseItem: (expenseId: string, itemId: string) => void;

  // Receipt Image actions
  loadReceiptImage: (expenseId: string) => Promise<string | null>;
  saveReceiptImage: (expenseId: string, imageBase64: string) => Promise<void>;
  deleteReceiptImage: (expenseId: string) => Promise<void>;

  // Sync
  syncPendingExpenses: () => Promise<void>;

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
    expenseItems: {},

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
        const accountId = useAccountStore.getState().currentAccountId;
        // 1. Show local data immediately
        const localExpenses = await loadAllExpenses(accountId || undefined);
        set({ expenses: localExpenses, isLoading: false });

        // 2. Sync pending local → server
        get().syncPendingExpenses();

        // 3. Pull from server → local (for shared accounts / other devices)
        try {
          const serverResult = await api.getExpenses();
          const serverExpenses: any[] = serverResult.data || serverResult;
          for (const se of serverExpenses) {
            const expense: Expense = {
              id: se.clientId || se.id,
              localId: se.clientId || se.id,
              serverId: se.id,
              userId: se.userId,
              accountId: se.accountId,
              amount: Number(se.amount),
              currencyCode: se.currencyCode,
              description: se.description ?? undefined,
              notes: se.notes ?? undefined,
              categoryId: se.category?.name ?? se.categoryId ?? undefined,
              date: new Date(se.date),
              time: se.time ?? undefined,
              source: se.source || 'manual',
              isRecurring: se.isRecurring || false,
              createdAt: new Date(se.createdAt),
              updatedAt: new Date(se.updatedAt),
              isDeleted: se.isDeleted || false,
              syncStatus: 'synced' as SyncStatus,
              syncVersion: se.syncVersion || 0,
            };
            await upsertExpense(expense);
          }
          // Reload from SQLite after merge
          const merged = await loadAllExpenses(accountId || undefined);
          set({ expenses: merged });
        } catch (e) {
          // Server pull failed (offline?) — local data is still shown
          console.log('Server pull skipped:', e);
        }
      } catch (e) {
        console.error('Failed to load expenses from SQLite:', e);
        set({ error: 'Failed to load expenses', isLoading: false });
      }
    },

    setExpenses: (expenses) => set({ expenses }),

    addExpense: (expenseData) => {
      const { items, receiptImageBase64, ...coreData } = expenseData;
      const id = generateUUID();
      const now = new Date();
      const accountId = useAccountStore.getState().currentAccountId || '';

      const newExpense: Expense = {
        ...coreData,
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
        expenses: [newExpense, ...state.expenses],
      }));

      insertExpense(newExpense).catch((e) =>
        console.error('Failed to insert expense into SQLite:', e),
      );

      // Save receipt image if provided
      if (receiptImageBase64) {
        saveReceiptImageLocally(id, receiptImageBase64).catch((e) =>
          console.error('Failed to save receipt image:', e),
        );
      }

      // Save expense items if provided
      if (items && items.length > 0) {
        const expenseItems: ExpenseItem[] = items.map((item, index) => ({
          id: generateUUID(),
          localId: generateUUID(),
          expenseId: id,
          description: item.description,
          quantity: item.quantity ?? 1,
          unitPrice: item.unitPrice ?? 0,
          totalPrice: item.totalPrice,
          sortOrder: item.sortOrder ?? index,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
          syncStatus: 'pending' as SyncStatus,
          syncVersion: 0,
        }));

        set((state) => ({
          expenseItems: { ...state.expenseItems, [id]: expenseItems },
        }));

        insertExpenseItems(expenseItems).catch((e) =>
          console.error('Failed to insert expense items into SQLite:', e),
        );
      }

      // Sync to server
      const sanitizedItems = items?.map((item) => ({
        description: item.description,
        quantity: Math.max(0, item.quantity ?? 1),
        unitPrice: Math.max(0, item.unitPrice ?? 0),
        totalPrice: Math.max(0, item.totalPrice ?? 0),
        sortOrder: item.sortOrder,
      }));
      api.createExpense({
        localId: id,
        amount: newExpense.amount,
        currencyCode: newExpense.currencyCode,
        description: newExpense.description,
        notes: newExpense.notes,
        categoryId: newExpense.categoryId || undefined,
        date: newExpense.date instanceof Date ? newExpense.date.toISOString() : newExpense.date,
        source: newExpense.source,
        items: sanitizedItems,
        receiptImageBase64,
      }).then(() => {
        set((state) => ({
          expenses: state.expenses.map((e) =>
            e.id === id ? { ...e, syncStatus: 'synced' as SyncStatus } : e
          ),
        }));
      }).catch((e) =>
        console.error('Failed to sync expense to server:', e),
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

        console.log('[updateExpense] updates:', JSON.stringify(updates));
        api.updateExpense(id, updates).catch((e) =>
          console.error('Failed to update expense on server:', e),
        );
      }
    },

    deleteExpense: (id) => {
      set((state) => ({
        expenses: state.expenses.filter((e) => e.id !== id),
      }));

      softDeleteExpenseInDb(id, new Date()).catch((e) =>
        console.error('Failed to soft-delete expense in SQLite:', e),
      );

      api.deleteExpense(id).catch((e) =>
        console.error('Failed to delete expense on server:', e),
      );
    },

    setFilters: (filters) =>
      set((state) => ({
        filters: { ...state.filters, ...filters },
      })),

    // ---- Expense Items ----

    loadExpenseItems: async (expenseId: string) => {
      try {
        const items = await loadItemsByExpenseId(expenseId);
        set((state) => ({
          expenseItems: { ...state.expenseItems, [expenseId]: items },
        }));
        return items;
      } catch (e) {
        console.error('Failed to load expense items:', e);
        return [];
      }
    },

    addExpenseItem: (expenseId: string, itemData) => {
      const id = generateUUID();
      const now = new Date();

      const newItem: ExpenseItem = {
        ...itemData,
        id,
        localId: id,
        expenseId,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        syncStatus: 'pending' as SyncStatus,
        syncVersion: 0,
      };

      set((state) => {
        const currentItems = state.expenseItems[expenseId] || [];
        return {
          expenseItems: {
            ...state.expenseItems,
            [expenseId]: [...currentItems, newItem],
          },
        };
      });

      insertExpenseItem(newItem).catch((e) =>
        console.error('Failed to insert expense item:', e),
      );

      return newItem;
    },

    updateExpenseItem: (expenseId: string, itemId: string, updates: Partial<ExpenseItem>) => {
      const now = new Date();
      set((state) => {
        const currentItems = state.expenseItems[expenseId] || [];
        return {
          expenseItems: {
            ...state.expenseItems,
            [expenseId]: currentItems.map((item) =>
              item.id === itemId
                ? { ...item, ...updates, updatedAt: now, syncStatus: 'pending' as SyncStatus }
                : item
            ),
          },
        };
      });

      updateExpenseItemInDb(itemId, updates, now, 'pending').catch((e) =>
        console.error('Failed to update expense item:', e),
      );
    },

    deleteExpenseItem: (expenseId: string, itemId: string) => {
      const now = new Date();
      set((state) => {
        const currentItems = state.expenseItems[expenseId] || [];
        return {
          expenseItems: {
            ...state.expenseItems,
            [expenseId]: currentItems.filter((item) => item.id !== itemId),
          },
        };
      });

      softDeleteExpenseItemInDb(itemId, now).catch((e) =>
        console.error('Failed to delete expense item:', e),
      );

      api.deleteExpenseItem(expenseId, itemId).catch((e) =>
        console.error('Failed to delete expense item on server:', e),
      );
    },

    // ---- Receipt Image ----

    loadReceiptImage: async (expenseId: string) => {
      try {
        return await getReceiptImageFromDb(expenseId);
      } catch (e) {
        console.error('Failed to load receipt image:', e);
        return null;
      }
    },

    saveReceiptImage: async (expenseId: string, imageBase64: string) => {
      try {
        await saveReceiptImageLocally(expenseId, imageBase64);
      } catch (e) {
        console.error('Failed to save receipt image:', e);
      }
    },

    deleteReceiptImage: async (expenseId: string) => {
      try {
        await deleteReceiptImageLocally(expenseId);
        await api.deleteReceiptImage(expenseId);
      } catch (e) {
        console.error('Failed to delete receipt image:', e);
      }
    },

    // ---- Sync ----

    syncPendingExpenses: async () => {
      const pending = get().expenses.filter(
        (e) => e.syncStatus === 'pending' && !e.isDeleted,
      );
      if (pending.length === 0) return;

      for (const expense of pending) {
        try {
          await api.createExpense({
            localId: expense.localId || expense.id,
            amount: expense.amount,
            currencyCode: expense.currencyCode,
            description: expense.description,
            notes: expense.notes,
            categoryId: expense.categoryId || undefined,
            date: expense.date instanceof Date ? expense.date.toISOString() : String(expense.date),
            source: expense.source,
          });
        } catch {
          // upsert handles duplicates, other errors skip silently
        }
        // Mark as synced in state and SQLite
        set((state) => ({
          expenses: state.expenses.map((e) =>
            e.id === expense.id ? { ...e, syncStatus: 'synced' as SyncStatus } : e
          ),
        }));
        updateExpenseInDb(expense.id, {}, new Date(), 'synced').catch(() => {});
      }
    },

    // ---- Selectors ----

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
