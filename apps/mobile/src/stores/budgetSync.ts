/**
 * budgetSync.ts — server pull/merge logic extracted from budgetStore.ts's
 * `loadBudgets`/`syncPendingBudgets`/`loadBudgetHistory`. Functions accept the
 * store's (set, get) as params so they share state without a circular import,
 * mirroring walletSync.ts.
 */
import type {
  Budget,
  BudgetCategoryAllocation,
  BudgetHistoryEntry,
  BudgetPeriod,
  Currency,
  SyncStatus,
} from '@budget/shared-types';
import {
  loadAllBudgets,
  upsertBudget,
  softDeleteBudgetInDb,
  updateBudgetInDb,
} from '@/db/budgetRepository';
import {
  getAllocationsForBudget,
  upsertBudgetCategory,
  deleteAllocationsForBudget,
} from '@/db/budgetCategoryRepository';
import { setLastSyncTime } from '@/db/syncMetadataRepository';
import { api } from '@/services/api';
import { maybeDecrypt, maybeEncrypt } from '@/services/encryptionHelper';
import { useAccountStore } from './accountStore';
import { resolveCategoryName } from './budgetCrudActions';

// Minimal store-state shape this sync logic needs from useBudgetStore
interface BudgetSyncState {
  budgets: Budget[];
  budgetHistory: Record<string, BudgetHistoryEntry[]>;
}

type StoreSet = (
  updater:
    | Partial<BudgetSyncState & { lastPullAt: number | null; isLoading: boolean }>
    | ((state: BudgetSyncState) => Partial<BudgetSyncState>),
) => void;
type StoreGet = () => BudgetSyncState;

/**
 * Pushes every locally-pending budget to the server. Never throws — a failed
 * push leaves the row `pending` for the next `loadBudgets` to retry, matching
 * the original `syncPendingBudgets` behavior.
 */
export async function syncPendingBudgetsAction(set: StoreSet, get: StoreGet): Promise<void> {
  const pending = get().budgets.filter((b) => b.syncStatus === 'pending' && !b.isDeleted);
  if (pending.length === 0) return;

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
        categories: budget.categoryAllocations?.map((a) => ({
          categoryId: resolveCategoryName(a.categoryId) || a.categoryId,
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
}

/**
 * Pulls budgets (+ their category allocations) from the server, merges them
 * into local SQLite, and refreshes in-memory state. Never throws — a failed
 * pull leaves the already-loaded local data in place (offline or server
 * hiccup), matching the original `loadBudgets` step-3 behavior.
 */
export async function syncBudgetsFromServer(
  set: StoreSet,
  get: StoreGet,
  accountId: string,
  localBudgets: Budget[],
): Promise<void> {
  try {
    const serverBudgets = await api.getBudgets();
    if (useAccountStore.getState().currentAccountId !== accountId) return;

    // Collect built server budgets so web (no real SQLite) can fall back
    // to them when the post-sync read-back is empty.
    const builtBudgets: Budget[] = [];

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

        builtBudgets.push(budget);
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

      // Web (no real SQLite): read-back is empty — fall back to built rows.
      set({
        budgets: merged.length > 0 ? merged : builtBudgets.filter((b) => !b.isDeleted),
        // Only here: the server actually answered. A caught failure below
        // must not set it, or a failed pull would look like a successful one.
        lastPullAt: Date.now(),
      });

      setLastSyncTime(Date.now());
    }
  } catch (e) {
    console.warn('Budget server sync skipped:', e);
  }
}

export async function loadBudgetHistoryAction(
  set: StoreSet,
  budgetId: string,
  periods = 6,
): Promise<void> {
  try {
    const history = await api.getBudgetHistory(budgetId, periods);
    if (Array.isArray(history)) {
      set((state) => ({
        budgetHistory: { ...state.budgetHistory, [budgetId]: history as BudgetHistoryEntry[] },
      }));
    }
  } catch {
    // History is non-critical — silently ignore network errors
  }
}
