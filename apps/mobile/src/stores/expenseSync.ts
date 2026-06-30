/**
 * expenseSync.ts — server pull/merge and pending-sync logic extracted from
 * expenseStore.ts. Functions accept Zustand's (set, get) as params so they
 * share store state without a circular import.
 */
import { Platform } from 'react-native';
import type { Expense, ExpenseItem, ExpenseCategorySplit, SyncStatus, Currency } from '@budget/shared-types';
import { setLastSyncTime } from '@/db/syncMetadataRepository';
import { withTransaction } from '@/db/client';
import {
  loadAllExpenses,
  upsertExpense,
  softDeleteExpenseInDb,
  updateExpenseInDb,
} from '@/db/expenseRepository';
import {
  loadItemsByExpenseId,
  upsertExpenseItem,
} from '@/db/expenseItemRepository';
import { insertExpenseTag, getTagsForExpense } from '@/db/tagRepository';
import {
  addExpenseToProject,
  getProjectIdForExpense,
  getAllProjectExpenseMappings,
  upsertProject,
} from '@/db/projectRepository';
import { getSplitsForExpense, insertSplit } from '@/db/splitRepository';
import { upsertCategory } from '@/db/categoryRepository';
import { api } from '@/services/api';
import { maybeEncrypt, maybeDecrypt } from '@/services/encryptionHelper';
import { useAccountStore } from './accountStore';
import { useCategoryStore } from './categoryStore';
import { useProjectStore } from './projectStore';

// Minimal store-state shape the sync functions need from useExpenseStore
interface SyncableState {
  expenses: Expense[];
  isLoading: boolean;
  error: string | null;
}

type StoreSet = (
  updater:
    | Partial<SyncableState>
    | ((state: SyncableState) => Partial<SyncableState>),
) => void;
type StoreGet = () => SyncableState;

// Module-level guards — were in expenseStore.ts, belong with the sync logic.
let _loadExpensesInflight: Promise<void> | null = null;
let _lastExpensesSyncAt = 0;
let _lastExpensesSyncedAccountId: string | null = null;
const EXPENSES_SYNC_SKIP_WINDOW_MS = 30_000;

// ─── syncPendingExpenses ─────────────────────────────────────────────────────

export async function syncPendingExpenses(
  _set: StoreSet,
  get: StoreGet,
): Promise<void> {
  const pending = get().expenses.filter(
    (e) => e.syncStatus === 'pending' && !e.isDeleted,
  );
  if (pending.length === 0) return;

  for (const expense of pending) {
    try {
      const localTags = await getTagsForExpense(expense.id);
      const localProjectId = await getProjectIdForExpense(expense.id);

      const { payload: encPayload, encryptedPayload, encryptionKeyVersion } =
        await maybeEncrypt(
          'expense',
          {
            description: expense.description,
            notes: expense.notes,
            merchant: expense.merchant,
            debtContactName: expense.debtContactName,
            amount: expense.amount,
            discountAmount: expense.discountAmount,
          },
          expense.accountId,
        );

      await api.createExpense({
        localId: expense.localId || expense.id,
        amount: encPayload.amount ?? expense.amount,
        discountAmount: encPayload.discountAmount ?? expense.discountAmount,
        currencyCode: expense.currencyCode,
        description: encPayload.description ?? expense.description,
        notes: encPayload.notes ?? expense.notes,
        merchant: encPayload.merchant ?? expense.merchant,
        categoryId: expense.categoryId || undefined,
        tagIds: localTags.length > 0 ? localTags.map((t) => t.id) : undefined,
        projectId: localProjectId || undefined,
        date:
          expense.date instanceof Date
            ? expense.date.toISOString()
            : String(expense.date),
        source: expense.source,
        isDebt: expense.isDebt || undefined,
        isDebtRepayment: expense.isDebtRepayment || undefined,
        debtContactName: encPayload.debtContactName ?? expense.debtContactName,
        debtDueDate: expense.debtDueDate
          ? expense.debtDueDate instanceof Date
            ? expense.debtDueDate.toISOString()
            : String(expense.debtDueDate)
          : undefined,
        relatedDebtIncomeId: expense.relatedDebtIncomeId || undefined,
        encryptedPayload,
        encryptionKeyVersion,
      } as any);
    } catch {
      // upsert handles duplicates; other errors skip silently (retry on next pull)
    }
    _set((state) => ({
      expenses: state.expenses.map((e) =>
        e.id === expense.id ? { ...e, syncStatus: 'synced' as SyncStatus } : e,
      ),
    }));
    updateExpenseInDb(expense.id, {}, new Date(), 'synced').catch(() => {});
  }
}

// ─── pullAndMergeExpenses ────────────────────────────────────────────────────

export function pullAndMergeExpenses(
  set: StoreSet,
  get: StoreGet,
  opts?: { force?: boolean },
): Promise<void> {
  // Re-entry guard: coalesce concurrent callers (DatabaseProvider, authStore,
  // tab useEffects all call this in parallel on cold start).
  if (_loadExpensesInflight) return _loadExpensesInflight;

  _loadExpensesInflight = _doPullAndMerge(set, get, opts);
  _loadExpensesInflight.finally(() => {
    _loadExpensesInflight = null;
  });
  return _loadExpensesInflight;
}

async function _doPullAndMerge(
  set: StoreSet,
  get: StoreGet,
  opts?: { force?: boolean },
): Promise<void> {
  set({ isLoading: true, error: null });
  try {
    const accountId = useAccountStore.getState().currentAccountId;
    if (!accountId) {
      set({ expenses: [], isLoading: false });
      return;
    }

    // 1. Show local data immediately
    const localExpenses = await loadAllExpenses(accountId);
    if (useAccountStore.getState().currentAccountId !== accountId) return;

    // Populate projectId from project_expenses join table
    const projectMappings = await getAllProjectExpenseMappings(accountId);
    const expenseProjectMap = new Map<string, string>();
    for (const m of projectMappings) expenseProjectMap.set(m.expenseId, m.projectId);
    for (const exp of localExpenses) {
      const pid = expenseProjectMap.get(exp.id);
      if (pid) exp.projectId = pid;
    }

    // On web SQLite is a no-op mock so localExpenses is always empty.
    // Only clobber when we have data, or when the in-memory rows belong to a
    // different account (so account-switch still clears).
    const inMemorySameAccount =
      get().expenses.length === 0 ||
      get().expenses[0].accountId === accountId;
    if (
      Platform.OS !== 'web' ||
      localExpenses.length > 0 ||
      !inMemorySameAccount
    ) {
      set({ expenses: localExpenses, isLoading: false });
    } else {
      set({ isLoading: false });
    }

    // Skip server-pull if we synced recently (unless forced).
    const msSinceLastSync = Date.now() - _lastExpensesSyncAt;
    const recent =
      _lastExpensesSyncedAccountId === accountId &&
      msSinceLastSync < EXPENSES_SYNC_SKIP_WINDOW_MS;
    if (recent && !opts?.force) return;

    // 2. Sync pending local → server
    syncPendingExpenses(set, get);

    // 3. Pull from server → local
    try {
      const serverResult = await api.getExpenses();
      if (useAccountStore.getState().currentAccountId !== accountId) return;
      const serverExpenses = serverResult.data;

      // ── PHASE A: build local lookup + dedup category/project maps ──
      const localById = new Map<string, Expense>();
      for (const e of localExpenses) localById.set(e.id, e);

      const categoryUpserts = new Map<string, Parameters<typeof upsertCategory>[0]>();
      const projectUpserts = new Map<string, Parameters<typeof upsertProject>[0]>();

      for (const se of serverExpenses) {
        if (se.category && se.category.id && !categoryUpserts.has(se.category.id)) {
          const c = se.category;
          const cn = new Date();
          categoryUpserts.set(c.id, {
            id: c.id,
            accountId: se.accountId,
            userId: c.userId ?? undefined,
            name: c.name,
            icon: c.icon ?? undefined,
            color: c.color ?? undefined,
            type: c.type || 'expense',
            isSystem: c.isSystem ?? false,
            parentId: c.parentId ?? undefined,
            createdAt: c.createdAt ? new Date(c.createdAt) : cn,
            updatedAt: c.updatedAt ? new Date(c.updatedAt) : cn,
            isDeleted: c.isDeleted ?? false,
            syncVersion: c.syncVersion ?? 0,
          });
        }
        if (Array.isArray(se.categorySplits)) {
          for (const ss of se.categorySplits) {
            if (ss.category && ss.category.id && !categoryUpserts.has(ss.category.id)) {
              const c = ss.category;
              const cn = new Date();
              categoryUpserts.set(c.id, {
                id: c.id,
                accountId: se.accountId,
                userId: c.userId ?? undefined,
                name: c.name,
                icon: c.icon ?? undefined,
                color: c.color ?? undefined,
                type: c.type || 'expense',
                isSystem: c.isSystem ?? false,
                parentId: c.parentId ?? undefined,
                createdAt: c.createdAt ? new Date(c.createdAt) : cn,
                updatedAt: c.updatedAt ? new Date(c.updatedAt) : cn,
                isDeleted: c.isDeleted ?? false,
                syncVersion: c.syncVersion ?? 0,
              });
            }
          }
        }
        if (Array.isArray(se.projectExpenses)) {
          for (const pe of se.projectExpenses) {
            if (pe.project && pe.project.id && !projectUpserts.has(pe.project.id)) {
              const proj = pe.project;
              const pn = new Date();
              projectUpserts.set(proj.id, {
                id: proj.id,
                accountId: proj.accountId,
                localId: proj.clientId || proj.id,
                name: proj.name,
                description: proj.description ?? undefined,
                color: proj.color ?? undefined,
                icon: proj.icon ?? undefined,
                startDate: proj.startDate ? new Date(proj.startDate) : undefined,
                endDate: proj.endDate ? new Date(proj.endDate) : undefined,
                budget: proj.budget ?? undefined,
                currencyCode: (proj.currencyCode ?? undefined) as Currency | undefined,
                isArchived: proj.isArchived ?? false,
                createdAt: proj.createdAt ? new Date(proj.createdAt) : pn,
                updatedAt: proj.updatedAt ? new Date(proj.updatedAt) : pn,
                isDeleted: proj.isDeleted ?? false,
                syncStatus: 'synced' as SyncStatus,
                syncVersion: proj.syncVersion ?? 0,
              });
            }
          }
        }
      }

      // ── PHASE B: decrypt every server record in parallel ──
      const decryptedAll = await Promise.all(
        serverExpenses.map((se) => maybeDecrypt('expense', se, se.accountId)),
      );

      // ── PHASE C: build Expense objects (pure JS, no DB) ──
      const builtExpenses: Expense[] = serverExpenses.map((se, i) => {
        const expenseId = se.clientId || se.id;
        const serverCategoryId = se.categoryId ?? se.category?.id ?? undefined;
        const serverDiscount =
          se.discountAmount != null ? Number(se.discountAmount) : undefined;
        const localExpense = localById.get(expenseId);
        const serverProjectId =
          se.projectExpenses &&
          Array.isArray(se.projectExpenses) &&
          se.projectExpenses.length > 0
            ? se.projectExpenses[0].projectId ?? se.projectExpenses[0].project?.id
            : undefined;
        const decrypted = decryptedAll[i];
        return {
          id: expenseId,
          localId: expenseId,
          serverId: se.id,
          userId: decrypted.userId,
          accountId: decrypted.accountId,
          amount: Number(decrypted.amount),
          discountAmount: serverDiscount ?? localExpense?.discountAmount,
          currencyCode: decrypted.currencyCode,
          description: decrypted.description ?? undefined,
          notes: decrypted.notes ?? undefined,
          merchant: decrypted.merchant ?? localExpense?.merchant,
          categoryId: serverCategoryId || localExpense?.categoryId,
          date: new Date(decrypted.date),
          time: decrypted.time ?? undefined,
          projectId: serverProjectId || localExpense?.projectId,
          source: decrypted.source || 'manual',
          isRecurring: decrypted.isRecurring || false,
          recurringId: decrypted.recurringId ?? undefined,
          recurringPeriod: decrypted.recurringPeriod ?? undefined,
          isDebt: decrypted.isDebt || false,
          isDebtRepayment: decrypted.isDebtRepayment || false,
          isPlanned: decrypted.isPlanned || false,
          debtContactName: decrypted.debtContactName ?? undefined,
          debtDueDate: decrypted.debtDueDate
            ? new Date(decrypted.debtDueDate)
            : undefined,
          relatedDebtIncomeId: decrypted.relatedDebtIncomeId ?? undefined,
          createdByUserName: se.createdByUserName ?? null,
          createdAt: new Date(decrypted.createdAt),
          updatedAt: new Date(decrypted.updatedAt),
          isDeleted: decrypted.isDeleted || false,
          syncStatus: 'synced' as SyncStatus,
          syncVersion: decrypted.syncVersion || 0,
        };
      });

      // ── PHASE D: single SQLite transaction for ALL writes ──
      const serverIdSet = new Set<string>(
        serverExpenses.map((se: any) => se.clientId || se.id),
      );
      await withTransaction(async () => {
        for (const c of categoryUpserts.values()) {
          try { await upsertCategory(c); } catch { /* skip */ }
        }
        for (const p of projectUpserts.values()) {
          try { await upsertProject(p); } catch { /* skip */ }
        }
        for (const e of builtExpenses) {
          await upsertExpense(e);
        }
        for (let i = 0; i < serverExpenses.length; i++) {
          const se = serverExpenses[i];
          const expense = builtExpenses[i];

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

          if (
            se.categorySplits &&
            Array.isArray(se.categorySplits) &&
            se.categorySplits.length > 0
          ) {
            const localSplits = await getSplitsForExpense(expense.id);
            if (localSplits.length === 0) {
              const now = new Date();
              for (const ss of se.categorySplits) {
                const split: ExpenseCategorySplit = {
                  id: ss.id,
                  expenseId: expense.id,
                  categoryId: ss.categoryId ?? ss.category?.id,
                  amount: Number(ss.amount),
                  percentage: Number(ss.percentage),
                  notes: ss.notes ?? undefined,
                  createdAt: ss.createdAt ? new Date(ss.createdAt) : now,
                  updatedAt: ss.updatedAt ? new Date(ss.updatedAt) : now,
                  isDeleted: ss.isDeleted || false,
                  syncVersion: ss.syncVersion ?? 0,
                };
                await insertSplit(split);
              }
            }
          }

          if (
            se.expenseTags &&
            Array.isArray(se.expenseTags) &&
            se.expenseTags.length > 0
          ) {
            const localTags = await getTagsForExpense(expense.id);
            if (localTags.length === 0) {
              const now = new Date();
              for (const et of se.expenseTags) {
                const tagId = et.tagId ?? et.tag?.id;
                if (!tagId) continue;
                try {
                  await insertExpenseTag({
                    id: et.id,
                    expenseId: expense.id,
                    tagId,
                    createdAt: et.createdAt ? new Date(et.createdAt) : now,
                    updatedAt: et.updatedAt ? new Date(et.updatedAt) : now,
                    isDeleted: et.isDeleted || false,
                    syncVersion: et.syncVersion ?? 0,
                  });
                } catch { /* duplicate */ }
              }
            }
          }

          if (
            se.projectExpenses &&
            Array.isArray(se.projectExpenses) &&
            se.projectExpenses.length > 0
          ) {
            const localProjectId = await getProjectIdForExpense(expense.id);
            if (!localProjectId) {
              const now = new Date();
              for (const pe of se.projectExpenses) {
                const projectId = pe.projectId ?? pe.project?.id;
                if (!projectId) continue;
                try {
                  await addExpenseToProject({
                    id: pe.id,
                    projectId,
                    expenseId: expense.id,
                    createdAt: pe.createdAt ? new Date(pe.createdAt) : now,
                    updatedAt: pe.updatedAt ? new Date(pe.updatedAt) : now,
                    isDeleted: pe.isDeleted || false,
                    syncVersion: pe.syncVersion ?? 0,
                  });
                } catch { /* duplicate */ }
              }
            }
          }
        }
        // Soft-delete locals that the server no longer returns
        for (const local of localExpenses) {
          if (local.syncStatus === 'synced' && !serverIdSet.has(local.id)) {
            await softDeleteExpenseInDb(local.id, new Date());
          }
        }
      });

      // Reload from SQLite after merge
      const merged = await loadAllExpenses(accountId);
      if (useAccountStore.getState().currentAccountId !== accountId) return;

      const mergedMappings = await getAllProjectExpenseMappings(accountId);
      const mergedProjectMap = new Map<string, string>();
      for (const m of mergedMappings) mergedProjectMap.set(m.expenseId, m.projectId);
      for (const exp of merged) {
        const pid = mergedProjectMap.get(exp.id);
        if (pid) exp.projectId = pid;
      }

      // Web (no real SQLite): fall back to freshly-built server rows.
      const finalExpenses =
        merged.length > 0 ? merged : builtExpenses.filter((e) => !e.isDeleted);

      set({ expenses: finalExpenses });
      setLastSyncTime(Date.now());
      _lastExpensesSyncAt = Date.now();
      _lastExpensesSyncedAccountId = accountId;

      // Refresh category and project stores (awaited — fire-and-forget caused
      // background SQLite contention with the next hydrateTransactions cycle).
      await Promise.all([
        useCategoryStore.getState().loadCategories(),
        useProjectStore.getState().loadProjects(),
      ]);
    } catch (e) {
      // Server pull failed (offline?) — local data is still shown
      console.warn('Server pull skipped:', e);
    }
  } catch (e) {
    console.error('Failed to load expenses from SQLite:', e);
    set({ error: 'Failed to load expenses', isLoading: false });
  }
}
