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
import { insertIncomeTag, getTagsForIncome } from '@/db/tagRepository';
import { getCategoryById as getCategoryFromDb, upsertCategory } from '@/db/categoryRepository';
import { setLastSyncTime } from '@/db/syncMetadataRepository';
import { api } from '@/services/api';
import { maybeEncrypt, maybeDecrypt } from '@/services/encryptionHelper';
import { useAccountStore } from './accountStore';
import { useCategoryStore } from './categoryStore';
import { useGamificationStore } from './gamificationStore';

interface IncomeFilters {
  dateRange: 'week' | 'month' | 'year' | 'all' | 'custom';
  categoryId: string | null;
  searchQuery: string;
  customMonth?: number; // 0-11
  customYear?: number;
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
    isDebt?: boolean;
    isDebtRepayment?: boolean;
    debtContactName?: string;
    debtDueDate?: Date;
    relatedDebtExpenseId?: string;
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
            const serverCategoryId = si.categoryId ?? si.category?.id ?? undefined;

            // Decrypt encrypted fields if present
            const decrypted = await maybeDecrypt('income', si, si.accountId);

            const income: Income = {
              id: incomeId,
              localId: incomeId,
              serverId: si.id,
              userId: decrypted.userId,
              accountId: decrypted.accountId,
              amount: Number(decrypted.amount),
              currencyCode: decrypted.currencyCode,
              description: decrypted.description ?? undefined,
              notes: decrypted.notes ?? undefined,
              categoryId: serverCategoryId || localIncome?.categoryId,
              date: new Date(decrypted.date),
              isDebt: decrypted.isDebt || false,
              isDebtRepayment: decrypted.isDebtRepayment || false,
              debtContactName: decrypted.debtContactName ?? undefined,
              debtDueDate: decrypted.debtDueDate ? new Date(decrypted.debtDueDate) : undefined,
              relatedDebtExpenseId: decrypted.relatedDebtExpenseId ?? undefined,
              createdAt: new Date(decrypted.createdAt),
              updatedAt: new Date(decrypted.updatedAt),
              isDeleted: decrypted.isDeleted || false,
              syncStatus: 'synced' as SyncStatus,
              syncVersion: decrypted.syncVersion || 0,
            };
            await upsertIncome(income);

            // Sync category from server if present (so other devices have it locally)
            if (si.category && si.category.id) {
              const tagNow2 = new Date();
              try {
                await upsertCategory({
                  id: si.category.id,
                  accountId: si.accountId,
                  userId: si.category.userId ?? undefined,
                  name: si.category.name,
                  icon: si.category.icon ?? undefined,
                  color: si.category.color ?? undefined,
                  type: si.category.type || 'income',
                  isSystem: si.category.isSystem ?? false,
                  parentId: si.category.parentId ?? undefined,
                  createdAt: si.category.createdAt ? new Date(si.category.createdAt) : tagNow2,
                  updatedAt: si.category.updatedAt ? new Date(si.category.updatedAt) : tagNow2,
                  isDeleted: si.category.isDeleted ?? false,
                  syncVersion: si.category.syncVersion ?? 0,
                });
              } catch { /* skip if already exists */ }
            }

            // Sync income tags from server
            if (si.incomeTags && Array.isArray(si.incomeTags) && si.incomeTags.length > 0) {
              const localTags = await getTagsForIncome(incomeId);
              if (localTags.length === 0) {
                const tagNow = new Date();
                for (const it of si.incomeTags) {
                  const tagId = it.tagId ?? it.tag?.id;
                  if (!tagId) continue;
                  try {
                    await insertIncomeTag({
                      id: it.id,
                      incomeId,
                      tagId,
                      createdAt: it.createdAt ? new Date(it.createdAt) : tagNow,
                      updatedAt: it.updatedAt ? new Date(it.updatedAt) : tagNow,
                      isDeleted: it.isDeleted || false,
                      syncVersion: it.syncVersion ?? 0,
                    });
                  } catch {
                    // Duplicate — skip
                  }
                }
              }
            }
          }

          // Mark locally-synced incomes as deleted if server no longer returns them
          const serverIdSet = new Set(serverIncomes.map((si: any) => si.clientId || si.id));
          for (const local of localIncomes) {
            if (local.syncStatus === 'synced' && !serverIdSet.has(local.id)) {
              await softDeleteIncomeInDb(local.id, new Date());
            }
          }

          // Refresh category store so UI picks up newly synced data
          useCategoryStore.getState().loadCategories();

          // Reload from SQLite after merge
          const merged = await loadAllIncomes(accountId);
          if (useAccountStore.getState().currentAccountId !== accountId) return;
          set({ incomes: merged });
          setLastSyncTime(Date.now());
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
        isDebt: coreData.isDebt || false,
        isDebtRepayment: coreData.isDebtRepayment || false,
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

      // Resolve category ID to name for the server (local IDs don't exist on server)
      let resolvedCategoryId: string | undefined = newIncome.categoryId;
      if (newIncome.categoryId) {
        const cat = await getCategoryFromDb(newIncome.categoryId);
        resolvedCategoryId = cat?.name || newIncome.categoryId;
      }

      // Fire-and-forget server sync with encryption
      maybeEncrypt('income', {
        description: newIncome.description,
        notes: newIncome.notes,
        amount: newIncome.amount,
        debtContactName: newIncome.debtContactName,
      }, accountId).then(({ payload: encPayload, encryptedPayload, encryptionKeyVersion }) => {
        return api.createIncome({
          localId: id,
          amount: encPayload.amount ?? newIncome.amount,
          currencyCode: newIncome.currencyCode,
          description: encPayload.description ?? newIncome.description,
          notes: encPayload.notes ?? newIncome.notes,
          categoryId: resolvedCategoryId,
          date: newIncome.date instanceof Date ? newIncome.date.toISOString() : newIncome.date,
          tagIds: tagIds?.length ? tagIds : undefined,
          projectId: projectId || undefined,
          isDebt: newIncome.isDebt || undefined,
          isDebtRepayment: newIncome.isDebtRepayment || undefined,
          debtContactName: encPayload.debtContactName ?? newIncome.debtContactName,
          debtDueDate: newIncome.debtDueDate instanceof Date ? newIncome.debtDueDate.toISOString() : newIncome.debtDueDate,
          relatedDebtExpenseId: newIncome.relatedDebtExpenseId,
          encryptedPayload,
          encryptionKeyVersion,
        } as any);
      }).then(() => {
        set((state) => ({
          incomes: state.incomes.map((i) =>
            i.id === id ? { ...i, syncStatus: 'synced' as SyncStatus } : i
          ),
        }));
      }).catch((e) =>
        console.error('Failed to sync income to server:', e),
      );

      // Fire-and-forget gamification check
      try { useGamificationStore.getState().checkAchievements(); } catch {}

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
          const tags = await getTagsForIncome(income.id);
          const tagIds = tags.map(t => t.id);
          let resolvedCategoryId: string | undefined = income.categoryId;
          if (income.categoryId) {
            const cat = await getCategoryFromDb(income.categoryId);
            resolvedCategoryId = cat?.name || income.categoryId;
          }
          const { payload: encPayload, encryptedPayload, encryptionKeyVersion } = await maybeEncrypt('income', {
            description: income.description,
            notes: income.notes,
            amount: income.amount,
          }, income.accountId);

          await api.createIncome({
            localId: income.localId || income.id,
            amount: encPayload.amount ?? income.amount,
            currencyCode: income.currencyCode,
            description: encPayload.description ?? income.description,
            notes: encPayload.notes ?? income.notes,
            categoryId: resolvedCategoryId,
            date: income.date instanceof Date ? income.date.toISOString() : String(income.date),
            tagIds: tagIds.length ? tagIds : undefined,
            isDebt: income.isDebt || undefined,
            isDebtRepayment: income.isDebtRepayment || undefined,
            debtContactName: income.debtContactName || undefined,
            debtDueDate: income.debtDueDate ? (income.debtDueDate instanceof Date ? income.debtDueDate.toISOString() : String(income.debtDueDate)) : undefined,
            relatedDebtExpenseId: income.relatedDebtExpenseId || undefined,
            encryptedPayload,
            encryptionKeyVersion,
          } as any);
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
      if (filters.dateRange === 'custom' && filters.customMonth != null && filters.customYear != null) {
        const startDate = new Date(filters.customYear, filters.customMonth, 1);
        const endDate = new Date(filters.customYear, filters.customMonth + 1, 0, 23, 59, 59, 999);
        filtered = filtered.filter((i) => {
          const d = new Date(i.date);
          return d >= startDate && d <= endDate;
        });
      } else if (filters.dateRange !== 'all') {
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
