/**
 * budgetCrudActions.ts — budget CRUD logic extracted from budgetStore.ts.
 * Functions accept the store's (set, get) as params so they share state
 * without a circular import, mirroring walletBalanceActions.ts.
 */
import type { Budget, BudgetCategoryAllocation, SyncStatus } from '@budget/shared-types';
import { generateUUID } from '@budget/shared-utils';
import {
  insertBudget,
  updateBudgetInDb,
  softDeleteBudgetInDb,
} from '@/db/budgetRepository';
import {
  insertBudgetCategory,
  deleteAllocationsForBudget,
} from '@/db/budgetCategoryRepository';
import { api } from '@/services/api';
import { maybeEncrypt } from '@/services/encryptionHelper';
import { useAccountStore } from './accountStore';
import { useCategoryStore } from './categoryStore';

// Minimal store-state shape these actions need from useBudgetStore
interface BudgetActionState {
  budgets: Budget[];
}

type StoreSet = (
  updater: Partial<BudgetActionState> | ((state: BudgetActionState) => Partial<BudgetActionState>),
) => void;
type StoreGet = () => BudgetActionState;

/**
 * The mobile app addresses a category by its LOCAL id; the server wants the
 * category's NAME (it re-resolves/creates by name on its side, see
 * `import-bank-category.util.ts`'s `resolveCategoryId` convention). This was
 * previously a `resolveCatId` closure hand-copied into `addBudget`,
 * `updateBudget`, and `syncPendingBudgets` — one function, defined once, so a
 * fix to the resolution rule only has to be made (and checked against the
 * API's own copy) in one place.
 */
export function resolveCategoryName(categoryId: string | undefined): string | undefined {
  if (!categoryId) return undefined;
  const cat = useCategoryStore.getState().getCategoryById(categoryId);
  return cat?.name || categoryId;
}

export function addBudgetAction(
  set: StoreSet,
  get: StoreGet,
  budgetData: Omit<
    Budget,
    'id' | 'localId' | 'accountId' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'syncVersion' | 'isDeleted'
  >,
): Budget {
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
      categories: categoryAllocations?.map((a) => ({
        categoryId: resolveCategoryName(a.categoryId) || a.categoryId,
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
}

export function updateBudgetAction(
  set: StoreSet,
  get: StoreGet,
  id: string,
  updates: Partial<Budget>,
): void {
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
          for (const alloc of updates.categoryAllocations as BudgetCategoryAllocation[]) {
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
    const apiUpdates: any = { ...updates };
    if (updates.categoryAllocations) {
      apiUpdates.categories = updates.categoryAllocations.map((a) => ({
        categoryId: resolveCategoryName(a.categoryId) || a.categoryId,
        amount: a.amount,
      }));
      delete apiUpdates.categoryAllocations;
    }
    api.updateBudget(budget.serverId, apiUpdates).catch((e) =>
      console.error('Failed to sync budget update to server:', e),
    );
  }
}

export function deleteBudgetAction(set: StoreSet, get: StoreGet, id: string): void {
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
}
