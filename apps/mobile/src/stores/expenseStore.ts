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
  upsertExpenseItem,
  updateExpenseItemInDb,
  softDeleteExpenseItemInDb,
  deduplicateItemsByExpenseId,
} from '@/db/expenseItemRepository';
import { insertExpenseTag } from '@/db/tagRepository';
import { addExpenseToProject } from '@/db/projectRepository';
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
  addExpense: (expense: Omit<Expense, 'id' | 'localId' | 'accountId' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'syncVersion' | 'isDeleted'> & { items?: Array<{ description: string; quantity?: number; unitPrice?: number; totalPrice: number; sortOrder?: number }>; receiptImageBase64?: string }) => Promise<Expense>;
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

  reset: () => void;
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

    totalThisMonth: 0,

    loadExpenses: async () => {
      set({ isLoading: true, error: null });
      try {
        const accountId = useAccountStore.getState().currentAccountId;
        if (!accountId) {
          set({ expenses: [], isLoading: false });
          return;
        }
        // 1. Show local data immediately
        const localExpenses = await loadAllExpenses(accountId);
        // Guard: abort if account switched during async operation
        if (useAccountStore.getState().currentAccountId !== accountId) return;
        set({ expenses: localExpenses, isLoading: false });

        // 2. Sync pending local → server
        get().syncPendingExpenses();

        // 3. Pull from server → local (for shared accounts / other devices)
        try {
          const serverResult = await api.getExpenses();
          // Guard: abort if account switched during server call
          if (useAccountStore.getState().currentAccountId !== accountId) return;
          const serverExpenses: any[] = (serverResult as any).data || serverResult;
          for (const se of serverExpenses) {
            const expenseId = se.clientId || se.id;
            const serverCategoryId = se.category?.name ?? se.categoryId ?? undefined;
            const serverDiscount = se.discountAmount != null ? Number(se.discountAmount) : undefined;

            // Preserve local category & discount if server doesn't have them
            const localExpense = localExpenses.find((e) => e.id === expenseId);
            const expense: Expense = {
              id: expenseId,
              localId: expenseId,
              serverId: se.id,
              userId: se.userId,
              accountId: se.accountId,
              amount: Number(se.amount),
              discountAmount: serverDiscount ?? localExpense?.discountAmount,
              currencyCode: se.currencyCode,
              description: se.description ?? undefined,
              notes: se.notes ?? undefined,
              categoryId: serverCategoryId || localExpense?.categoryId,
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

            // Sync expense items from server only if no local items exist
            if (se.items && Array.isArray(se.items) && se.items.length > 0) {
              const localItems = await loadItemsByExpenseId(expense.id);
              if (localItems.length === 0) {
                const now = new Date();
                for (const si of se.items) {
                  const item: ExpenseItem = {
                    id: si.id,
                    localId: si.id,
                    expenseId: expense.id,
                    description: si.description,
                    quantity: si.quantity ?? 1,
                    unitPrice: Number(si.unitPrice ?? 0),
                    totalPrice: Number(si.totalPrice ?? 0),
                    sortOrder: si.sortOrder ?? 0,
                    isDeleted: si.isDeleted || false,
                    syncStatus: 'synced' as SyncStatus,
                    syncVersion: si.syncVersion ?? 0,
                    createdAt: si.createdAt ? new Date(si.createdAt) : now,
                    updatedAt: si.updatedAt ? new Date(si.updatedAt) : now,
                  };
                  await upsertExpenseItem(item);
                }
              }
            }
          }
          // Mark locally-synced expenses as deleted if server no longer returns them
          const serverIdSet = new Set(serverExpenses.map((se: any) => se.clientId || se.id));
          for (const local of localExpenses) {
            if (local.syncStatus === 'synced' && !serverIdSet.has(local.id)) {
              await softDeleteExpenseInDb(local.id, new Date());
            }
          }

          // Reload from SQLite after merge
          const merged = await loadAllExpenses(accountId);
          // Guard: abort if account switched during merge
          if (useAccountStore.getState().currentAccountId !== accountId) return;
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

    addExpense: async (expenseData) => {
      const { items, receiptImageBase64, tagIds, projectId, ...coreData } = expenseData;
      const id = generateUUID();
      const now = new Date();
      const accountId = useAccountStore.getState().currentAccountId || '';

      const newExpense: Expense = {
        ...coreData,
        id,
        localId: id,
        accountId,
        projectId,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending' as SyncStatus,
        syncVersion: 0,
        isDeleted: false,
      };

      set((state) => ({
        expenses: [newExpense, ...state.expenses],
      }));

      // Await local SQLite writes so data is persisted before navigation
      await insertExpense(newExpense);

      // Save tag associations to expense_tags join table
      if (tagIds && tagIds.length > 0) {
        for (const tagId of tagIds) {
          await insertExpenseTag({
            id: generateUUID(),
            expenseId: id,
            tagId,
            createdAt: now,
            updatedAt: now,
            isDeleted: false,
            syncVersion: 0,
          });
        }
      }

      // Save project association to project_expenses join table
      if (projectId) {
        await addExpenseToProject({
          id: generateUUID(),
          projectId,
          expenseId: id,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
          syncVersion: 0,
        });
      }

      if (receiptImageBase64) {
        await saveReceiptImageLocally(id, receiptImageBase64);
      }

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

        await insertExpenseItems(expenseItems);
      }

      // Fire-and-forget server sync (non-blocking)
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
        discountAmount: newExpense.discountAmount,
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
        // Clean up any existing duplicates first
        await deduplicateItemsByExpenseId(expenseId);

        // Try local first
        let items = await loadItemsByExpenseId(expenseId);

        // Fallback: fetch from server if local is empty
        if (items.length === 0) {
          try {
            const serverItems: any[] = await api.getExpenseItems(expenseId);
            if (serverItems && serverItems.length > 0) {
              const now = new Date();
              items = serverItems.map((si: any, index: number) => ({
                id: si.id,
                localId: si.id,
                expenseId,
                description: si.description,
                quantity: si.quantity ?? 1,
                unitPrice: Number(si.unitPrice ?? 0),
                totalPrice: Number(si.totalPrice ?? 0),
                sortOrder: si.sortOrder ?? index,
                isDeleted: si.isDeleted || false,
                syncStatus: 'synced' as SyncStatus,
                syncVersion: si.syncVersion ?? 0,
                createdAt: si.createdAt ? new Date(si.createdAt) : now,
                updatedAt: si.updatedAt ? new Date(si.updatedAt) : now,
              }));
              // Save to local SQLite
              for (const item of items) {
                await upsertExpenseItem(item);
              }
            }
          } catch {
            // Server fetch failed (offline)
          }
        }

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
        // Try local first
        const local = await getReceiptImageFromDb(expenseId);
        if (local) return local;

        // Fallback: fetch from server
        try {
          const result = await api.getReceiptImage(expenseId);
          if (result?.imageBase64) {
            await saveReceiptImageLocally(expenseId, result.imageBase64);
            return result.imageBase64;
          }
        } catch {
          // Server fetch failed (offline or no image on server)
        }
        return null;
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

    reset: () => set({ expenses: [], expenseItems: {}, isLoading: false, error: null }),

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

// Auto-recompute totalThisMonth whenever expenses change
useExpenseStore.subscribe(
  (s) => s.expenses,
  (expenses) => {
    const now = new Date();
    const startOfMonth = getStartOfMonth(now);
    const endOfMonth = getEndOfMonth(now);
    const accountCurrency = useAccountStore.getState().currentAccount?.()?.currencyCode || 'USD';

    const totalThisMonth = expenses
      .filter((e) => !e.isDeleted)
      .filter((e) => e.currencyCode === accountCurrency)
      .filter((e) => {
        const expenseDate = new Date(e.date);
        return expenseDate >= startOfMonth && expenseDate <= endOfMonth;
      })
      .reduce((sum, e) => sum + e.amount, 0);

    useExpenseStore.setState({ totalThisMonth });
  },
);
