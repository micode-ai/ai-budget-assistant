import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Income, Currency, SyncStatus } from '@budget/shared-types';
import { generateUUID, getStartOfMonth, getEndOfMonth } from '@budget/shared-utils';
import {
  loadAllIncomes,
  insertIncome,
  upsertIncome,
  updateIncomeInDb,
  softDeleteIncomeInDb,
} from '@/db/incomeRepository';
import { insertIncomeTag } from '@/db/tagRepository';
import { api } from '@/services/api';
import { useAccountStore } from './accountStore';

interface IncomeFilters {
  dateRange: 'week' | 'month' | 'year' | 'all';
  categoryId: string | null;
  searchQuery: string;
}

interface IncomeState {
  incomes: Income[];
  isLoading: boolean;
  error: string | null;
  filters: IncomeFilters;

  totalThisMonth: number;
  incomeTotalsByCurrency: Record<string, number>;

  loadIncomes: () => Promise<void>;
  addIncome: (income: {
    userId: string;
    amount: number;
    currencyCode: Currency;
    description?: string;
    notes?: string;
    categoryId?: string;
    tagIds?: string[];
    projectId?: string;
    date: Date;
  }) => Promise<Income>;
  updateIncome: (id: string, updates: Partial<Income>) => void;
  deleteIncome: (id: string) => void;
  setFilters: (filters: Partial<IncomeFilters>) => void;

  syncPendingIncomes: () => Promise<void>;

  getFilteredIncomes: () => Income[];

  reset: () => void;
}

function computeIncomeTotalsByCurrency(incomes: Income[]): Record<string, number> {
  const now = new Date();
  const startOfMonth = getStartOfMonth(now);
  const endOfMonth = getEndOfMonth(now);

  const totals: Record<string, number> = {};
  incomes
    .filter((i) => !i.isDeleted)
    .filter((i) => {
      const incomeDate = new Date(i.date);
      return incomeDate >= startOfMonth && incomeDate <= endOfMonth;
    })
    .forEach((i) => {
      totals[i.currencyCode] = (totals[i.currencyCode] || 0) + i.amount;
    });
  return totals;
}

function computeTotalThisMonth(incomes: Income[]): number {
  const totals = computeIncomeTotalsByCurrency(incomes);
  return Object.values(totals).reduce((sum, v) => sum + v, 0);
}

export const useIncomeStore = create<IncomeState>()(
  subscribeWithSelector((set, get) => ({
    incomes: [],
    isLoading: false,
    error: null,
    filters: {
      dateRange: 'month',
      categoryId: null,
      searchQuery: '',
    },

    totalThisMonth: 0,
    incomeTotalsByCurrency: {},

    loadIncomes: async () => {
      set({ isLoading: true, error: null });
      try {
        const accountId = useAccountStore.getState().currentAccountId;
        if (!accountId) {
          set({ incomes: [], isLoading: false });
          return;
        }

        // 1. Show local data immediately
        const localIncomes = await loadAllIncomes(accountId);
        if (useAccountStore.getState().currentAccountId !== accountId) return;
        set({ incomes: localIncomes, isLoading: false });

        // 2. Sync pending local → server
        get().syncPendingIncomes();

        // 3. Pull from server → local
        try {
          const serverResult = await api.getIncomes();
          if (useAccountStore.getState().currentAccountId !== accountId) return;
          const serverIncomes: any[] = (serverResult as any).data || serverResult;

          for (const si of serverIncomes) {
            const incomeId = si.clientId || si.id;
            const localIncome = localIncomes.find((i) => i.id === incomeId);
            const serverCategoryId = si.category?.name ?? si.categoryId ?? undefined;

            const income: Income = {
              id: incomeId,
              localId: incomeId,
              serverId: si.id,
              userId: si.userId,
              accountId: si.accountId,
              amount: Number(si.amount),
              currencyCode: si.currencyCode,
              description: si.description ?? undefined,
              notes: si.notes ?? undefined,
              categoryId: serverCategoryId || localIncome?.categoryId,
              date: new Date(si.date),
              createdAt: new Date(si.createdAt),
              updatedAt: new Date(si.updatedAt),
              isDeleted: si.isDeleted || false,
              syncStatus: 'synced' as SyncStatus,
              syncVersion: si.syncVersion || 0,
            };
            await upsertIncome(income);
          }

          // Mark locally-synced incomes as deleted if server no longer returns them
          const serverIdSet = new Set(serverIncomes.map((si: any) => si.clientId || si.id));
          for (const local of localIncomes) {
            if (local.syncStatus === 'synced' && !serverIdSet.has(local.id)) {
              await softDeleteIncomeInDb(local.id, new Date());
            }
          }

          // Reload from SQLite after merge
          const merged = await loadAllIncomes(accountId);
          if (useAccountStore.getState().currentAccountId !== accountId) return;
          set({ incomes: merged });
        } catch (e) {
          console.log('Server pull skipped (incomes):', e);
        }
      } catch (e) {
        console.error('Failed to load incomes from SQLite:', e);
        set({ error: 'Failed to load incomes', isLoading: false });
      }
    },

    addIncome: async (incomeData) => {
      const { tagIds, projectId, ...coreData } = incomeData;
      const id = generateUUID();
      const now = new Date();
      const accountId = useAccountStore.getState().currentAccountId || '';

      const newIncome: Income = {
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
        incomes: [newIncome, ...state.incomes],
      }));

      await insertIncome(newIncome);

      // Save tag associations to income_tags join table
      if (tagIds && tagIds.length > 0) {
        for (const tagId of tagIds) {
          await insertIncomeTag({
            id: generateUUID(),
            incomeId: id,
            tagId,
            createdAt: now,
            updatedAt: now,
            isDeleted: false,
            syncVersion: 0,
          });
        }
      }

      // Fire-and-forget server sync
      api.createIncome({
        localId: id,
        amount: newIncome.amount,
        currencyCode: newIncome.currencyCode,
        description: newIncome.description,
        notes: newIncome.notes,
        categoryId: newIncome.categoryId || undefined,
        date: newIncome.date instanceof Date ? newIncome.date.toISOString() : newIncome.date,
      }).then(() => {
        set((state) => ({
          incomes: state.incomes.map((i) =>
            i.id === id ? { ...i, syncStatus: 'synced' as SyncStatus } : i
          ),
        }));
      }).catch((e) =>
        console.error('Failed to sync income to server:', e),
      );

      return newIncome;
    },

    updateIncome: (id, updates) => {
      set((state) => ({
        incomes: state.incomes.map((i) =>
          i.id === id
            ? {
                ...i,
                ...updates,
                updatedAt: new Date(),
                syncStatus: i.syncStatus === 'synced' ? 'pending' : i.syncStatus,
              }
            : i
        ),
      }));

      const updatedIncome = get().incomes.find((i) => i.id === id);
      if (updatedIncome) {
        updateIncomeInDb(
          id,
          updates,
          updatedIncome.updatedAt,
          updatedIncome.syncStatus,
        ).catch((e) =>
          console.error('Failed to update income in SQLite:', e),
        );

        api.updateIncome(id, updates).catch((e) =>
          console.error('Failed to update income on server:', e),
        );
      }
    },

    deleteIncome: (id) => {
      set((state) => ({
        incomes: state.incomes.filter((i) => i.id !== id),
      }));

      softDeleteIncomeInDb(id, new Date()).catch((e) =>
        console.error('Failed to soft-delete income in SQLite:', e),
      );

      api.deleteIncome(id).catch((e) =>
        console.error('Failed to delete income on server:', e),
      );
    },

    setFilters: (filters) =>
      set((state) => ({
        filters: { ...state.filters, ...filters },
      })),

    syncPendingIncomes: async () => {
      const pending = get().incomes.filter(
        (i) => i.syncStatus === 'pending' && !i.isDeleted,
      );
      if (pending.length === 0) return;

      for (const income of pending) {
        try {
          await api.createIncome({
            localId: income.localId || income.id,
            amount: income.amount,
            currencyCode: income.currencyCode,
            description: income.description,
            notes: income.notes,
            categoryId: income.categoryId || undefined,
            date: income.date instanceof Date ? income.date.toISOString() : String(income.date),
          });
        } catch {
          // upsert handles duplicates
        }
        set((state) => ({
          incomes: state.incomes.map((i) =>
            i.id === income.id ? { ...i, syncStatus: 'synced' as SyncStatus } : i
          ),
        }));
        updateIncomeInDb(income.id, {}, new Date(), 'synced').catch(() => {});
      }
    },

    reset: () => set({ incomes: [], isLoading: false, error: null }),

    getFilteredIncomes: () => {
      const { incomes, filters } = get();
      let filtered = incomes.filter((i) => !i.isDeleted);

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
        filtered = filtered.filter((i) => new Date(i.date) >= startDate);
      }

      if (filters.categoryId) {
        filtered = filtered.filter((i) => i.categoryId === filters.categoryId);
      }

      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        filtered = filtered.filter(
          (i) =>
            i.description?.toLowerCase().includes(query) ||
            i.notes?.toLowerCase().includes(query)
        );
      }

      return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },
  }))
);

// Auto-recompute totals whenever incomes change
useIncomeStore.subscribe(
  (s) => s.incomes,
  (incomes) => {
    const incomeTotalsByCurrency = computeIncomeTotalsByCurrency(incomes);
    const totalThisMonth = Object.values(incomeTotalsByCurrency).reduce((sum, v) => sum + v, 0);
    useIncomeStore.setState({ totalThisMonth, incomeTotalsByCurrency });
  },
);
