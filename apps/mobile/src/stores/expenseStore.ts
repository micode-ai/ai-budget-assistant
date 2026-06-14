import { Platform } from 'react-native';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Expense, ExpenseItem, ExpenseCategorySplit, SyncStatus } from '@budget/shared-types';
import { generateUUID, getStartOfMonth, getEndOfMonth, getStartOfWeek, getEndOfWeek } from '@budget/shared-utils';
import i18n from '@/i18n';
import {
  insertExpense,
  updateExpenseInDb,
  softDeleteExpenseInDb,
  saveReceiptImageLocally,
  getReceiptImageFromDb,
  deleteReceiptImageLocally,
  bulkRenameMerchant,
  bulkMergeMerchants,
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
import { insertExpenseTag, getTagsForExpense } from '@/db/tagRepository';
import { addExpenseToProject, removeExpenseFromProject, getProjectIdForExpense } from '@/db/projectRepository';
import { api } from '@/services/api';
import { maybeEncrypt } from '@/services/encryptionHelper';
import { getDistinctMerchants as computeDistinctMerchants, getMerchantCounts as computeMerchantCounts } from '@/utils/merchant';
import { pullAndMergeExpenses, syncPendingExpenses as doSync } from './expenseSync';
import { useAccountStore } from './accountStore';
import { useCategoryStore } from './categoryStore';
import { useGamificationStore } from './gamificationStore';

interface ExpenseFilters {
  dateRange: 'week' | 'month' | 'year' | 'all' | 'custom';
  categoryId: string | null;
  merchants: string[];
  searchQuery: string;
  customMonth?: number; // 0-11
  customYear?: number;
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
  expenseTotalsByCurrency: Record<string, number>;

  // Actions
  loadExpenses: (opts?: { force?: boolean }) => Promise<void>;
  setExpenses: (expenses: Expense[]) => void;
  addExpense: (expense: Omit<Expense, 'id' | 'localId' | 'accountId' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'syncVersion' | 'isDeleted' | 'items'> & { items?: { description: string; quantity?: number; unitPrice?: number; totalPrice: number; sortOrder?: number }[]; receiptImageBase64?: string; splits?: { categoryId: string; amount: number; percentage: number; notes?: string }[] }) => Promise<Expense>;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  setExpenseProject: (expenseId: string, projectId: string | null) => Promise<void>;
  deleteExpense: (id: string) => void;
  bulkUpdateExpenses: (ids: string[], patch: { categoryId?: string | null; tagIds?: string[]; isDeleted?: boolean }) => Promise<void>;
  stopRecurringExpense: (id: string) => Promise<void>;
  setFilters: (filters: Partial<ExpenseFilters>) => void;

  // Expense Items actions
  loadExpenseItems: (expenseId: string) => Promise<ExpenseItem[]>;
  addExpenseItem: (expenseId: string, itemData: { description: string; quantity: number; unitPrice: number; totalPrice: number; sortOrder: number }) => ExpenseItem;
  updateExpenseItem: (expenseId: string, itemId: string, updates: Partial<ExpenseItem>) => void;
  deleteExpenseItem: (expenseId: string, itemId: string) => void;

  // Receipt Image actions
  loadReceiptImage: (expenseId: string) => Promise<{ base64: string; mimeType: string } | null>;
  saveReceiptImage: (expenseId: string, imageBase64: string, mimeType?: string) => Promise<void>;
  deleteReceiptImage: (expenseId: string) => Promise<void>;

  // Sync
  syncPendingExpenses: () => Promise<void>;

  // Selectors
  getFilteredExpenses: () => Expense[];
  getDistinctMerchants: () => string[];
  getMerchantCounts: () => { merchant: string; count: number }[];
  renameMerchant: (from: string, to: string | null) => Promise<number>;
  mergeMerchants: (sources: string[], target: string) => Promise<number>;
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
      merchants: [],
      searchQuery: '',
    },
    expenseItems: {},

    totalThisMonth: 0,
    expenseTotalsByCurrency: {},

    loadExpenses: (opts) => pullAndMergeExpenses(set as any, get as any, opts),

    setExpenses: (expenses) => set({ expenses }),

    addExpense: async (expenseData) => {
      const { items, receiptImageBase64, tagIds, projectId, splits, ...coreData } = expenseData;
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

      // Fire-and-forget server sync
      const sanitizedItems = items?.map((item) => ({
        description: item.description,
        quantity: Math.max(0, item.quantity ?? 1),
        unitPrice: Math.max(0, item.unitPrice ?? 0),
        totalPrice: Math.max(0, item.totalPrice ?? 0),
        sortOrder: item.sortOrder,
      }));
      const catStore = useCategoryStore.getState();
      const resolveCatId = (catId: string | undefined) => {
        if (!catId) return undefined;
        const cat = catStore.getCategoryById(catId);
        return cat?.name || catId;
      };
      // Mark as syncing immediately to prevent syncPendingExpenses from picking it up
      set((state) => ({
        expenses: state.expenses.map((e) =>
          e.id === id ? { ...e, syncStatus: 'synced' as SyncStatus } : e
        ),
      }));
      updateExpenseInDb(id, {}, new Date(), 'synced').catch(() => {});

      maybeEncrypt('expense', {
        description: newExpense.description,
        notes: newExpense.notes,
        merchant: newExpense.merchant,
        amount: newExpense.amount,
        discountAmount: newExpense.discountAmount,
        debtContactName: newExpense.debtContactName,
      }, accountId).then(({ payload: encPayload, encryptedPayload, encryptionKeyVersion }) => {
        return api.createExpense({
          localId: id,
          amount: encPayload.amount ?? newExpense.amount,
          discountAmount: encPayload.discountAmount ?? newExpense.discountAmount,
          currencyCode: newExpense.currencyCode,
          description: encPayload.description ?? newExpense.description,
          notes: encPayload.notes ?? newExpense.notes,
          merchant: encPayload.merchant ?? newExpense.merchant,
          categoryId: resolveCatId(newExpense.categoryId),
          tagIds: tagIds?.length ? tagIds : undefined,
          projectId: projectId || undefined,
          date: newExpense.date instanceof Date ? newExpense.date.toISOString() : newExpense.date,
          source: newExpense.source,
          items: sanitizedItems,
          receiptImageBase64,
          splits: splits?.length ? splits.map(s => ({ ...s, categoryId: resolveCatId(s.categoryId) || s.categoryId })) : undefined,
          isDebt: newExpense.isDebt || undefined,
          isDebtRepayment: newExpense.isDebtRepayment || undefined,
          debtContactName: encPayload.debtContactName ?? newExpense.debtContactName,
          debtDueDate: newExpense.debtDueDate instanceof Date ? newExpense.debtDueDate.toISOString() : newExpense.debtDueDate,
          relatedDebtIncomeId: newExpense.relatedDebtIncomeId,
          isRecurring: newExpense.isRecurring || undefined,
          recurringId: newExpense.recurringId,
          recurringPeriod: newExpense.recurringPeriod,
          encryptedPayload,
          encryptionKeyVersion,
        } as any);
      }).catch((e) => {
        // Revert to pending so syncPendingExpenses can retry later
        set((state) => ({
          expenses: state.expenses.map((exp) =>
            exp.id === id ? { ...exp, syncStatus: 'pending' as SyncStatus } : exp
          ),
        }));
        updateExpenseInDb(id, {}, new Date(), 'pending').catch(() => {});
        console.warn('Expense sync deferred (offline?):', e);
      });

      try { useGamificationStore.getState().checkAchievements(); } catch {}

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

        api.updateExpense(id, updates).catch((e) =>
          console.warn('Expense update sync deferred (offline?):', e),
        );
      }
    },

    // projectId lives in the project_expenses join table (not an expenses column),
    // so the generic updateExpense can't manage it — and `undefined` would be
    // dropped from the JSON body, making it impossible to clear server-side.
    setExpenseProject: async (expenseId, projectId) => {
      const current = get().expenses.find((e) => e.id === expenseId);
      if (!current) return;
      const oldProjectId = current.projectId || null;
      if (oldProjectId === projectId) return;

      set((state) => ({
        expenses: state.expenses.map((e) =>
          e.id === expenseId
            ? { ...e, projectId: projectId || undefined, updatedAt: new Date() }
            : e
        ),
      }));

      try {
        if (oldProjectId) await removeExpenseFromProject(oldProjectId, expenseId);
        if (projectId) {
          const now = new Date();
          await addExpenseToProject({
            id: generateUUID(),
            projectId,
            expenseId,
            createdAt: now,
            updatedAt: now,
            isDeleted: false,
            syncVersion: 0,
          });
        }
      } catch (e) {
        console.error('Failed to update project association in SQLite:', e);
      }

      api.updateExpense(expenseId, { projectId }).catch((e) =>
        console.warn('Expense project sync deferred (offline?):', e),
      );
    },

    deleteExpense: (id) => {
      if (!useAccountStore.getState().canEdit()) return;

      set((state) => ({
        expenses: state.expenses.filter((e) => e.id !== id),
      }));

      softDeleteExpenseInDb(id, new Date()).catch((e) =>
        console.error('Failed to soft-delete expense in SQLite:', e),
      );

      api.deleteExpense(id).catch((e) =>
        console.warn('Expense delete sync deferred (offline?):', e),
      );
    },

    bulkUpdateExpenses: async (ids, patch) => {
      const { expenses } = get();
      const now = new Date();

      set({
        expenses: expenses
          .map((e) => {
            if (!ids.includes(e.id)) return e;
            if (patch.isDeleted) return { ...e, isDeleted: true, updatedAt: now };
            return {
              ...e,
              ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId ?? undefined } : {}),
              ...(patch.tagIds !== undefined
                ? { tagIds: [...new Set([...(e.tagIds ?? []), ...patch.tagIds])] }
                : {}),
              updatedAt: now,
              syncStatus: 'pending' as SyncStatus,
            };
          })
          .filter((e) => !e.isDeleted),
      });

      const accountId = useAccountStore.getState().currentAccountId;
      if (!accountId) return;

      for (const id of ids) {
        if (patch.isDeleted) {
          await softDeleteExpenseInDb(id, now);
        } else {
          const updates: Record<string, any> = {};
          if (patch.categoryId !== undefined) updates.categoryId = patch.categoryId;
          if (Object.keys(updates).length > 0) {
            await updateExpenseInDb(id, updates, now, 'pending');
          }
          if (patch.tagIds && patch.tagIds.length > 0) {
            for (const tagId of patch.tagIds) {
              try {
                await insertExpenseTag({
                  id: generateUUID(),
                  expenseId: id,
                  tagId,
                  createdAt: now,
                  updatedAt: now,
                  isDeleted: false,
                  syncVersion: 0,
                });
              } catch { /* already linked */ }
            }
          }
        }
      }

      api.bulkUpdateExpenses({ ids, ...patch }).catch((e: any) =>
        console.warn('[expenseStore] bulkUpdate server error:', e?.message || e)
      );
    },

    stopRecurringExpense: async (id) => {
      set((state) => ({
        expenses: state.expenses.map((e) =>
          e.id === id ? { ...e, isRecurring: false, updatedAt: new Date() } : e
        ),
      }));
      await updateExpenseInDb(id, { isRecurring: false }, new Date(), 'synced');
      await api.stopRecurringExpense(id);
    },

    setFilters: (filters) =>
      set((state) => ({
        filters: { ...state.filters, ...filters },
      })),

    // ── Expense Items ──────────────────────────────────────────────────────────

    loadExpenseItems: async (expenseId: string) => {
      try {
        await deduplicateItemsByExpenseId(expenseId);

        let items = await loadItemsByExpenseId(expenseId);

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
              for (const item of items) {
                await upsertExpenseItem(item);
              }
            }
          } catch { /* offline */ }
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
          expenseItems: { ...state.expenseItems, [expenseId]: [...currentItems, newItem] },
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
        console.warn('Expense item delete sync deferred (offline?):', e),
      );
    },

    // ── Receipt Image ──────────────────────────────────────────────────────────

    loadReceiptImage: async (expenseId: string): Promise<{ base64: string; mimeType: string } | null> => {
      try {
        const local = await getReceiptImageFromDb(expenseId);
        if (local) return local;

        try {
          const result = await api.getReceiptImage(expenseId);
          if (result?.imageBase64) {
            const mimeType = result.mimeType || 'image/jpeg';
            await saveReceiptImageLocally(expenseId, result.imageBase64, mimeType);
            return { base64: result.imageBase64, mimeType };
          }
        } catch { /* offline */ }

        return null;
      } catch (e) {
        console.error('Failed to load receipt image:', e);
        return null;
      }
    },

    saveReceiptImage: async (expenseId: string, imageBase64: string, mimeType?: string) => {
      try {
        await saveReceiptImageLocally(expenseId, imageBase64, mimeType);
        api.saveReceiptImage(expenseId, imageBase64, mimeType).catch((e) =>
          console.warn('Receipt image sync deferred (offline?):', e),
        );
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

    // ── Sync ───────────────────────────────────────────────────────────────────

    syncPendingExpenses: () => doSync(set as any, get as any),

    reset: () =>
      set({ expenses: [], expenseItems: {}, isLoading: false, error: null, totalThisMonth: 0, expenseTotalsByCurrency: {} }),

    // ── Selectors ──────────────────────────────────────────────────────────────

    getFilteredExpenses: () => {
      const { expenses, filters } = get();
      let filtered = expenses.filter((e) => !e.isDeleted);

      const now = new Date();
      if (filters.dateRange === 'custom' && filters.customMonth != null && filters.customYear != null) {
        const startDate = new Date(filters.customYear, filters.customMonth, 1);
        const endDate = new Date(filters.customYear, filters.customMonth + 1, 0, 23, 59, 59, 999);
        filtered = filtered.filter((e) => {
          const d = new Date(e.date);
          return d >= startDate && d <= endDate;
        });
      } else if (filters.dateRange !== 'all') {
        let startDate: Date;
        let endDate: Date;
        switch (filters.dateRange) {
          case 'week':
            startDate = getStartOfWeek(now);
            endDate = getEndOfWeek(now);
            break;
          case 'month':
            startDate = getStartOfMonth(now);
            endDate = getEndOfMonth(now);
            break;
          case 'year':
            startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
            endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
            break;
          default:
            startDate = new Date(0);
            endDate = now;
        }
        filtered = filtered.filter((e) => {
          const d = new Date(e.date);
          return d >= startDate && d <= endDate;
        });
      }

      if (filters.categoryId) {
        filtered = filtered.filter((e) => e.categoryId === filters.categoryId);
      }

      if (filters.merchants.length > 0) {
        filtered = filtered.filter((e) => e.merchant != null && filters.merchants.includes(e.merchant));
      }

      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        filtered = filtered.filter(
          (e) =>
            e.description?.toLowerCase().includes(query) ||
            e.notes?.toLowerCase().includes(query) ||
            e.merchant?.toLowerCase().includes(query)
        );
      }

      return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },

    getDistinctMerchants: () => computeDistinctMerchants(get().expenses),

    getMerchantCounts: () => computeMerchantCounts(get().expenses),

    renameMerchant: async (from, to) => {
      if (to === from) return 0;
      const accountId = useAccountStore.getState().currentAccountId || '';
      const affected = get().expenses.filter((e) => !e.isDeleted && e.merchant === from);
      if (affected.length === 0) return 0;
      const now = new Date();
      set((state) => ({
        expenses: state.expenses.map((e) =>
          !e.isDeleted && e.merchant === from
            ? { ...e, merchant: to || undefined, updatedAt: now, syncStatus: 'pending' as SyncStatus }
            : e
        ),
      }));
      try {
        await bulkRenameMerchant(accountId, from, to);
      } catch (e) {
        console.error('Failed to bulk-rename merchant in SQLite:', e);
      }
      get().syncPendingExpenses().catch((e) =>
        console.warn('Merchant rename sync deferred (offline?):', e),
      );
      return affected.length;
    },

    mergeMerchants: async (sources, target) => {
      const trimmed = target.trim();
      if (!trimmed || sources.length === 0) return 0;
      const sourceSet = new Set(sources);
      const accountId = useAccountStore.getState().currentAccountId || '';
      const matches = (e: Expense) =>
        !e.isDeleted && e.merchant != null && sourceSet.has(e.merchant) && e.merchant !== trimmed;
      const affected = get().expenses.filter(matches);
      if (affected.length === 0) return 0;
      const now = new Date();
      set((state) => ({
        expenses: state.expenses.map((e) =>
          matches(e)
            ? { ...e, merchant: trimmed, updatedAt: now, syncStatus: 'pending' as SyncStatus }
            : e,
        ),
      }));
      try {
        await bulkMergeMerchants(accountId, sources, trimmed);
      } catch (e) {
        console.error('Failed to bulk-merge merchants in SQLite:', e);
      }
      get().syncPendingExpenses().catch((e) =>
        console.warn('Merchant merge sync deferred (offline?):', e),
      );
      return affected.length;
    },

    getExpensesByCategory: () => {
      const filtered = get().getFilteredExpenses();
      const total = filtered.reduce((sum, e) => sum + e.amount, 0);
      if (total === 0) return [];

      const categoryMap = new Map<string | null, { amount: number; count: number }>();
      filtered.forEach((expense) => {
        const key = expense.categoryId || null;
        const current = categoryMap.get(key) || { amount: 0, count: 0 };
        categoryMap.set(key, { amount: current.amount + expense.amount, count: current.count + 1 });
      });

      return Array.from(categoryMap.entries())
        .map(([categoryId, data]) => ({
          categoryId,
          name: categoryId || i18n.t('common.uncategorized'),
          amount: data.amount,
          percentage: (data.amount / total) * 100,
          count: data.count,
        }))
        .sort((a, b) => b.amount - a.amount);
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
        case 'year':
          currentStart = new Date(now.getFullYear(), 0, 1);
          currentEnd = now;
          previousStart = new Date(now.getFullYear() - 1, 0, 1);
          previousEnd = new Date(now.getFullYear() - 1, 11, 31);
          break;
        case 'month':
        default: {
          currentStart = getStartOfMonth(now);
          currentEnd = getEndOfMonth(now);
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          previousStart = getStartOfMonth(lastMonth);
          previousEnd = getEndOfMonth(lastMonth);
          break;
        }
      }

      const currentTotal = expenses
        .filter((e) => !e.isDeleted)
        .filter((e) => { const d = new Date(e.date); return d >= currentStart && d <= currentEnd; })
        .reduce((sum, e) => sum + e.amount, 0);

      const previousTotal = expenses
        .filter((e) => !e.isDeleted)
        .filter((e) => { const d = new Date(e.date); return d >= previousStart && d <= previousEnd; })
        .reduce((sum, e) => sum + e.amount, 0);

      if (previousTotal === 0) return 0;
      return ((currentTotal - previousTotal) / previousTotal) * 100;
    },
  }))
);

function computeExpenseTotalsByCurrency(expenses: Expense[]): Record<string, number> {
  const now = new Date();
  const startOfMonth = getStartOfMonth(now);
  const endOfMonth = getEndOfMonth(now);

  const totals: Record<string, number> = {};
  expenses
    .filter((e) => !e.isDeleted)
    .filter((e) => {
      const expenseDate = new Date(e.date);
      return expenseDate >= startOfMonth && expenseDate <= endOfMonth;
    })
    .forEach((e) => {
      totals[e.currencyCode] = (totals[e.currencyCode] || 0) + e.amount;
    });
  return totals;
}

// Auto-recompute totalThisMonth whenever expenses change
useExpenseStore.subscribe(
  (s) => s.expenses,
  (expenses) => {
    const expenseTotalsByCurrency = computeExpenseTotalsByCurrency(expenses);
    const accountCurrency = useAccountStore.getState().currentAccount?.()?.currencyCode || 'USD';
    const totalThisMonth = expenseTotalsByCurrency[accountCurrency] || 0;

    useExpenseStore.setState({ totalThisMonth, expenseTotalsByCurrency });

    clearTimeout((globalThis as any).__widgetRefreshTimer);
    (globalThis as any).__widgetRefreshTimer = setTimeout(() => {
      const { refreshWidgetData } = require('@/services/widgetData');
      refreshWidgetData();
    }, 1000);
  },
);
