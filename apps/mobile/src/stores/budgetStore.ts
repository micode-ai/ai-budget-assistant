import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Budget, BudgetProgress, BudgetCategoryProgress, BudgetCategoryAllocation, BudgetPeriod, Currency, SyncStatus } from '@budget/shared-types';
import { generateUUID, getStartOfMonth, getEndOfMonth, getStartOfWeek, getEndOfWeek } from '@budget/shared-utils';
import { useExpenseStore } from './expenseStore';
import { useAccountStore } from './accountStore';
import { useCategoryStore } from './categoryStore';
import { useExchangeRateStore } from './exchangeRateStore';
import { api } from '@/services/api';
import { maybeEncrypt, maybeDecrypt } from '@/services/encryptionHelper';
import {
  loadAllBudgets,
  insertBudget,
  upsertBudget,
  updateBudgetInDb,
  softDeleteBudgetInDb,
  clearAllBudgets,
} from '@/db/budgetRepository';
import {
  getAllocationsForBudget,
  insertBudgetCategory,
  upsertBudgetCategory,
  deleteAllocationsForBudget,
  clearAllBudgetCategories,
} from '@/db/budgetCategoryRepository';
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
  getBudgetProgress: (budgetId: string, referenceDate?: Date) => BudgetProgress | null;
  getMonthlyBudgetSummary: () => {
    totalAmount: number;
    totalSpent: number;
    // Count of active monthly budgets. When isOverall=true the card shows
    // only the overall; this count still reflects all active monthlies and
    // is used to decide whether the card is rendered at all.
    budgetCount: number;
    isOverall: boolean;
  };
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

        // Load allocations for each budget
        for (const budget of localBudgets) {
          const allocs = await getAllocationsForBudget(budget.id);
          if (allocs.length > 0) {
            budget.categoryAllocations = allocs;
          }
        }

        set({ budgets: localBudgets, isLoading: false });

        // 2. Sync pending local → server
        get().syncPendingBudgets();

        // 3. Pull from server → local
        try {
          const serverBudgets = await api.getBudgets();
          if (useAccountStore.getState().currentAccountId !== accountId) return;

          if (Array.isArray(serverBudgets)) {
            for (const sb of serverBudgets) {
              // Decrypt encrypted fields if present
              const decrypted = await maybeDecrypt('budget', sb, sb.accountId);

              const budget: Budget = {
                id: sb.clientId || sb.id,
                localId: sb.clientId || sb.id,
                serverId: sb.id,
                userId: sb.userId,
                accountId: sb.accountId,
                name: decrypted.name,
                amount: Number(decrypted.amount),
                currencyCode: (sb.currencyCode || 'USD') as Currency,
                period: sb.period as BudgetPeriod,
                startDate: new Date(sb.startDate),
                endDate: sb.endDate ? new Date(sb.endDate) : undefined,
                categoryId: sb.categoryId ?? undefined,
                alertThreshold: sb.alertThreshold ?? null,
                isActive: sb.isActive ?? true,
                createdAt: new Date(sb.createdAt),
                updatedAt: new Date(sb.updatedAt),
                isDeleted: sb.isDeleted || false,
                syncStatus: 'synced' as SyncStatus,
                syncVersion: sb.syncVersion || 0,
              };
              await upsertBudget(budget);

              // Sync category allocations from server
              if (sb.categoryAllocations && Array.isArray(sb.categoryAllocations)) {
                // Remove old allocations for this budget
                await deleteAllocationsForBudget(budget.id);

                const allocations: BudgetCategoryAllocation[] = [];
                for (const sa of sb.categoryAllocations) {
                  if (sa.isDeleted) continue;
                  const alloc: BudgetCategoryAllocation = {
                    id: sa.id,
                    budgetId: budget.id,
                    categoryId: sa.categoryId,
                    amount: Number(sa.amount),
                    createdAt: new Date(sa.createdAt),
                    updatedAt: new Date(sa.updatedAt),
                    isDeleted: false,
                    syncVersion: sa.syncVersion || 0,
                  };
                  await upsertBudgetCategory(alloc);
                  allocations.push(alloc);
                }
                budget.categoryAllocations = allocations.length > 0 ? allocations : undefined;
              }
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

            // Reload allocations for merged budgets
            for (const budget of merged) {
              const allocs = await getAllocationsForBudget(budget.id);
              if (allocs.length > 0) {
                budget.categoryAllocations = allocs;
              }
            }

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

      const catStore = useCategoryStore.getState();
      const resolveCatId = (catId: string | undefined) => {
        if (!catId) return undefined;
        const cat = catStore.getCategoryById(catId);
        return cat?.name || catId;
      };

      for (const budget of pending) {
        try {
          // Encrypt before sending
          const { payload: encPayload, encryptedPayload, encryptionKeyVersion } = await maybeEncrypt('budget', {
            name: budget.name,
            amount: budget.amount,
          }, budget.accountId);

          await api.createBudget({
            localId: budget.localId || budget.id,
            name: encPayload.name ?? budget.name,
            amount: encPayload.amount ?? budget.amount,
            currencyCode: budget.currencyCode,
            period: budget.period,
            startDate: budget.startDate instanceof Date ? budget.startDate.toISOString() : budget.startDate,
            endDate: budget.endDate instanceof Date ? budget.endDate.toISOString() : budget.endDate,
            categoryId: resolveCatId(budget.categoryId),
            categories: budget.categoryAllocations?.map((a) => ({
              categoryId: resolveCatId(a.categoryId) || a.categoryId,
              amount: a.amount,
            })),
            alertThreshold: budget.alertThreshold,
            encryptedPayload,
            encryptionKeyVersion,
          } as any);
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

      // Assign budgetId to allocations
      const categoryAllocations = budgetData.categoryAllocations?.map((a) => ({
        ...a,
        id: a.id || generateUUID(),
        budgetId: id,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        syncVersion: 0,
      }));

      const newBudget: Budget = {
        ...budgetData,
        id,
        localId: id,
        accountId,
        categoryAllocations,
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

      // Persist category allocations to SQLite
      if (categoryAllocations && categoryAllocations.length > 0) {
        for (const alloc of categoryAllocations) {
          insertBudgetCategory(alloc).catch((e) =>
            console.error('Failed to insert budget category in SQLite:', e),
          );
        }
      }

      // Resolve local category IDs to names for server sync
      const catStore = useCategoryStore.getState();
      const resolveCatId = (catId: string | undefined) => {
        if (!catId) return undefined;
        const cat = catStore.getCategoryById(catId);
        return cat?.name || catId;
      };

      // Encrypt sensitive fields before sending to server
      maybeEncrypt('budget', {
        name: budgetData.name,
        amount: budgetData.amount,
      }, accountId).then(({ payload: encPayload, encryptedPayload, encryptionKeyVersion }) => {
        return api.createBudget({
          localId: id,
          name: encPayload.name ?? budgetData.name,
          amount: encPayload.amount ?? budgetData.amount,
          currencyCode: budgetData.currencyCode,
          period: budgetData.period,
          startDate: budgetData.startDate instanceof Date ? budgetData.startDate.toISOString() : budgetData.startDate,
          endDate: budgetData.endDate instanceof Date ? budgetData.endDate.toISOString() : budgetData.endDate,
          categoryId: resolveCatId(budgetData.categoryId),
          categories: categoryAllocations?.map((a) => ({
            categoryId: resolveCatId(a.categoryId) || a.categoryId,
            amount: a.amount,
          })),
          alertThreshold: budgetData.alertThreshold,
          encryptedPayload,
          encryptionKeyVersion,
        } as any);
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

        // Replace category allocations if provided
        if (updates.categoryAllocations !== undefined) {
          deleteAllocationsForBudget(id).then(() => {
            if (updates.categoryAllocations && updates.categoryAllocations.length > 0) {
              for (const alloc of updates.categoryAllocations) {
                insertBudgetCategory({
                  ...alloc,
                  id: alloc.id || generateUUID(),
                  budgetId: id,
                  createdAt: alloc.createdAt || new Date(),
                  updatedAt: new Date(),
                  isDeleted: false,
                  syncVersion: 0,
                }).catch((e) =>
                  console.error('Failed to insert budget category in SQLite:', e),
                );
              }
            }
          }).catch((e) =>
            console.error('Failed to delete budget categories in SQLite:', e),
          );
        }
      }

      // Sync to server
      if (budget?.serverId) {
        const catStore = useCategoryStore.getState();
        const resolveCatId = (catId: string | undefined) => {
          if (!catId) return undefined;
          const cat = catStore.getCategoryById(catId);
          return cat?.name || catId;
        };

        const apiUpdates: any = { ...updates };
        if (updates.categoryAllocations) {
          apiUpdates.categories = updates.categoryAllocations.map((a) => ({
            categoryId: resolveCatId(a.categoryId) || a.categoryId,
            amount: a.amount,
          }));
          delete apiUpdates.categoryAllocations;
        }
        if (apiUpdates.categoryId) {
          apiUpdates.categoryId = resolveCatId(apiUpdates.categoryId) || apiUpdates.categoryId;
        }
        api.updateBudget(budget.serverId, apiUpdates).catch((e) =>
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

      // Soft-delete category allocations
      deleteAllocationsForBudget(id).catch((e) =>
        console.error('Failed to delete budget categories in SQLite:', e),
      );

      // Sync to server
      if (budget?.serverId) {
        api.deleteBudget(budget.serverId).catch((e) =>
          console.error('Failed to sync budget deletion to server:', e),
        );
      }
    },

    getBudgetProgress: (budgetId: string, referenceDate?: Date): BudgetProgress | null => {
      const budget = get().budgets.find((b) => b.id === budgetId);
      if (!budget || budget.isDeleted) return null;

      const expenses = useExpenseStore.getState().expenses.filter((e) => !e.isDeleted);

      // Get period dates
      let periodStart: Date;
      let periodEnd: Date;
      const now = referenceDate ?? new Date();

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

      // Multi-category support
      const allocations = budget.categoryAllocations || [];
      const hasMultiCategory = allocations.length > 0;

      if (hasMultiCategory) {
        const categoryIds = new Set(allocations.map((a) => a.categoryId));
        periodExpenses = periodExpenses.filter((e) => categoryIds.has(e.categoryId || ''));
      } else if (budget.categoryId) {
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

      // Per-category breakdown for multi-category budgets
      let categoryBreakdown: BudgetCategoryProgress[] | undefined;
      if (hasMultiCategory) {
        const categoriesState = useCategoryStore.getState();
        categoryBreakdown = allocations.map((alloc) => {
          const catExpenses = periodExpenses.filter((e) => e.categoryId === alloc.categoryId);
          const catSpent = catExpenses.reduce((sum, e) => sum + e.amount, 0);
          const cat = categoriesState.categories.find((c) => c.id === alloc.categoryId);
          return {
            categoryId: alloc.categoryId,
            categoryName: cat?.name || 'Unknown',
            categoryColor: cat?.color,
            allocated: alloc.amount,
            spent: catSpent,
            remaining: Math.max(0, alloc.amount - catSpent),
            percentageUsed: alloc.amount > 0 ? (catSpent / alloc.amount) * 100 : 0,
            isOverBudget: catSpent > alloc.amount,
          };
        });
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
        categoryBreakdown,
      };
    },

    getMonthlyBudgetSummary: () => {
      const activeMonthly = get().budgets.filter(
        (b) => b.isActive && !b.isDeleted && b.period === 'monthly',
      );

      const { rates, baseCurrency } = useExchangeRateStore.getState();
      const convertToBase = (amount: number, fromCurrency: string) => {
        if (!baseCurrency || fromCurrency === baseCurrency) return amount;
        const rate = rates[fromCurrency];
        if (!rate || rate === 0) return amount;
        return amount / rate;
      };

      if (activeMonthly.length === 0) {
        return { totalAmount: 0, totalSpent: 0, budgetCount: 0, isOverall: false };
      }

      const overall = activeMonthly.find(
        (b) => !b.categoryId && (!b.categoryAllocations || b.categoryAllocations.length === 0),
      );

      // progress.spent is always in the budget's own currency —
      // getBudgetProgress filters expenses by budget.currencyCode and does not
      // convert. Both amount and spent are converted to base here in parallel.
      if (overall) {
        const progress = get().getBudgetProgress(overall.id);
        const spent = progress ? progress.spent : 0;
        return {
          totalAmount: convertToBase(overall.amount, overall.currencyCode),
          totalSpent: convertToBase(spent, overall.currencyCode),
          budgetCount: activeMonthly.length,
          isOverall: true,
        };
      }

      let totalAmount = 0;
      let totalSpent = 0;
      for (const b of activeMonthly) {
        totalAmount += convertToBase(b.amount, b.currencyCode);
        const progress = get().getBudgetProgress(b.id);
        if (progress) {
          totalSpent += convertToBase(progress.spent, b.currencyCode);
        }
      }

      return {
        totalAmount,
        totalSpent,
        budgetCount: activeMonthly.length,
        isOverall: false,
      };
    },

    reset: () => {
      clearAllBudgets().catch(() => {});
      clearAllBudgetCategories().catch(() => {});
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
