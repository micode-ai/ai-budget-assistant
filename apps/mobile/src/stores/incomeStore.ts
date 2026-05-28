import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Income, Currency, SyncStatus } from '@budget/shared-types';
import { generateUUID, getStartOfMonth, getEndOfMonth, getStartOfWeek, getEndOfWeek } from '@budget/shared-utils';
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
import { withTransaction } from '@/db/client';
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

  loadIncomes: (opts?: { force?: boolean }) => Promise<void>;
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

// Module-level state for coalescing concurrent loadIncomes calls and
// skipping redundant server pulls within a short window.
let _loadIncomesInflight: Promise<void> | null = null;
let _lastIncomesSyncAt = 0;
let _lastIncomesSyncedAccountId: string | null = null;
const INCOMES_SYNC_SKIP_WINDOW_MS = 30_000;

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

    loadIncomes: (opts?: { force?: boolean }) => {
      if (_loadIncomesInflight) return _loadIncomesInflight;

      _loadIncomesInflight = (async () => {
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

        // Skip server-pull if we synced recently for this account (unless forced).
        const msSinceLastSync = Date.now() - _lastIncomesSyncAt;
        const recent = _lastIncomesSyncedAccountId === accountId && msSinceLastSync < INCOMES_SYNC_SKIP_WINDOW_MS;
        if (recent && !opts?.force) return;

        // 2. Sync pending local → server
        get().syncPendingIncomes();

        // 3. Pull from server → local
        try {
          const serverResult = await api.getIncomes();
          if (useAccountStore.getState().currentAccountId !== accountId) return;
          const serverIncomes: any[] = (serverResult as any).data || serverResult;

          // -------- PHASE A: build local lookup + dedup category map --------
          const localById = new Map<string, Income>();
          for (const i of localIncomes) localById.set(i.id, i);

          const categoryUpserts = new Map<string, Parameters<typeof upsertCategory>[0]>();
          for (const si of serverIncomes) {
            if (si.category && si.category.id && !categoryUpserts.has(si.category.id)) {
              const c = si.category;
              const cn = new Date();
              categoryUpserts.set(c.id, {
                id: c.id,
                accountId: si.accountId,
                userId: c.userId ?? undefined,
                name: c.name,
                icon: c.icon ?? undefined,
                color: c.color ?? undefined,
                type: c.type || 'income',
                isSystem: c.isSystem ?? false,
                parentId: c.parentId ?? undefined,
                createdAt: c.createdAt ? new Date(c.createdAt) : cn,
                updatedAt: c.updatedAt ? new Date(c.updatedAt) : cn,
                isDeleted: c.isDeleted ?? false,
                syncVersion: c.syncVersion ?? 0,
              });
            }
          }

          // -------- PHASE B: decrypt every server record in parallel --------
          const decryptedAll = await Promise.all(serverIncomes.map((si) => maybeDecrypt('income', si, si.accountId)));

          // -------- PHASE C: build Income objects --------
          const builtIncomes: Income[] = serverIncomes.map((si, i) => {
            const incomeId = si.clientId || si.id;
            const localIncome = localById.get(incomeId);
            const serverCategoryId = si.categoryId ?? si.category?.id ?? undefined;
            const decrypted = decryptedAll[i];
            return {
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
              createdByUserName: si.createdByUserName ?? null,
              createdAt: new Date(decrypted.createdAt),
              updatedAt: new Date(decrypted.updatedAt),
              isDeleted: decrypted.isDeleted || false,
              syncStatus: 'synced' as SyncStatus,
              syncVersion: decrypted.syncVersion || 0,
            };
          });

          // -------- PHASE D: single SQLite transaction for ALL writes --------
          const serverIdSet = new Set<string>(serverIncomes.map((si: any) => si.clientId || si.id));
          await withTransaction(async () => {
              for (const c of categoryUpserts.values()) {
                try { await upsertCategory(c); } catch { /* skip */ }
              }
              for (const inc of builtIncomes) {
                await upsertIncome(inc);
              }
              for (let i = 0; i < serverIncomes.length; i++) {
                const si = serverIncomes[i];
                const incomeId = builtIncomes[i].id;
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
                      } catch { /* duplicate */ }
                    }
                  }
                }
              }
              for (const local of localIncomes) {
                if (local.syncStatus === 'synced' && !serverIdSet.has(local.id)) {
                  await softDeleteIncomeInDb(local.id, new Date());
                }
              }
            });

          // Refresh category store so UI picks up newly synced data.
          // AWAITED so the next hydrate cycle doesn't contend with a background
          // SQLite read for categories.
          await useCategoryStore.getState().loadCategories();

          // Reload from SQLite after merge
          const merged = await loadAllIncomes(accountId);
          if (useAccountStore.getState().currentAccountId !== accountId) return;
          set({ incomes: merged });
          setLastSyncTime(Date.now());
          _lastIncomesSyncAt = Date.now();
          _lastIncomesSyncedAccountId = accountId;
        } catch (e) {
          console.warn('Server pull skipped (incomes):', e);
        }
      } catch (e) {
        console.error('Failed to load incomes from SQLite:', e);
        set({ error: 'Failed to load incomes', isLoading: false });
      }
      })();
      _loadIncomesInflight.finally(() => { _loadIncomesInflight = null; });
      return _loadIncomesInflight;
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
        // Expected when offline — the row stays 'pending' and syncPendingIncomes
        // retries on reconnect. warn (not error) so RN LogBox doesn't red-screen.
        console.warn('Income sync deferred (offline?):', e),
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
          // Expected offline; local SQLite already updated + marked pending.
          console.warn('Income update sync deferred (offline?):', e),
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
        // Expected offline; local row soft-deleted + marked pending.
        console.warn('Income delete sync deferred (offline?):', e),
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

    reset: () =>
      set({ incomes: [], isLoading: false, error: null, totalThisMonth: 0, incomeTotalsByCurrency: {} }),

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
        filtered = filtered.filter((i) => {
          const d = new Date(i.date);
          return d >= startDate && d <= endDate;
        });
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
