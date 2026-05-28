import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Expense, ExpenseItem, ExpenseCategorySplit, SyncStatus } from '@budget/shared-types';
import { generateUUID, getStartOfMonth, getEndOfMonth, getStartOfWeek, getEndOfWeek } from '@budget/shared-utils';
import i18n from '@/i18n';
import {
  loadAllExpenses,
  insertExpense,
  upsertExpense,
  updateExpenseInDb,
  softDeleteExpenseInDb,
  saveReceiptImageLocally,
  getReceiptImageFromDb,
  deleteReceiptImageLocally,
  bulkRenameMerchant,
} from '@/db/expenseRepository';
import { setLastSyncTime } from '@/db/syncMetadataRepository';
import { withTransaction } from '@/db/client';
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
import { addExpenseToProject, removeExpenseFromProject, getProjectIdForExpense, getAllProjectExpenseMappings, upsertProject } from '@/db/projectRepository';
import { getSplitsForExpense, insertSplit } from '@/db/splitRepository';
import { upsertCategory } from '@/db/categoryRepository';
import { api } from '@/services/api';
import { maybeEncrypt, maybeDecrypt } from '@/services/encryptionHelper';
import { getDistinctMerchants as computeDistinctMerchants, getMerchantCounts as computeMerchantCounts } from '@/utils/merchant';
import { useAccountStore } from './accountStore';
import { useCategoryStore } from './categoryStore';
import { useProjectStore } from './projectStore';
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
  getExpensesByCategory: () => CategoryBreakdown[];
  getTrendVsLastPeriod: () => number;

  reset: () => void;
}

// Module-level state for coalescing concurrent loadExpenses calls and
// skipping redundant server pulls within a short window.
let _loadExpensesInflight: Promise<void> | null = null;
let _lastExpensesSyncAt = 0;
let _lastExpensesSyncedAccountId: string | null = null;
const EXPENSES_SYNC_SKIP_WINDOW_MS = 30_000;

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

    loadExpenses: (opts?: { force?: boolean }) => {
      // Re-entry guard: coalesce concurrent callers (DatabaseProvider, authStore,
      // tab useEffects all call this in parallel on cold start).
      if (_loadExpensesInflight) return _loadExpensesInflight;

      _loadExpensesInflight = (async () => {
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

        // Populate projectId from project_expenses join table
        const projectMappings = await getAllProjectExpenseMappings(accountId);
        const expenseProjectMap = new Map<string, string>();
        for (const m of projectMappings) {
          expenseProjectMap.set(m.expenseId, m.projectId);
        }
        for (const exp of localExpenses) {
          const pid = expenseProjectMap.get(exp.id);
          if (pid) exp.projectId = pid;
        }

        set({ expenses: localExpenses, isLoading: false });

        // Skip server-pull if we synced recently for this account (unless forced).
        // Pull-to-refresh passes force:true to bypass.
        const msSinceLastSync = Date.now() - _lastExpensesSyncAt;
        const recent = _lastExpensesSyncedAccountId === accountId && msSinceLastSync < EXPENSES_SYNC_SKIP_WINDOW_MS;
        if (recent && !opts?.force) return;

        // 2. Sync pending local → server
        get().syncPendingExpenses();

        // 3. Pull from server → local (for shared accounts / other devices)
        try {
          const serverResult = await api.getExpenses();
          // Guard: abort if account switched during server call
          if (useAccountStore.getState().currentAccountId !== accountId) return;
          const serverExpenses: any[] = (serverResult as any).data || serverResult;

          // -------- PHASE A: build local lookup + dedup category/project maps --------
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
                    currencyCode: proj.currencyCode ?? undefined,
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

          // -------- PHASE B: decrypt every server record in parallel --------
          const decryptedAll = await Promise.all(serverExpenses.map((se) => maybeDecrypt('expense', se, se.accountId)));

          // -------- PHASE C: build Expense objects (pure JS, no DB) --------
          const builtExpenses: Expense[] = serverExpenses.map((se, i) => {
            const expenseId = se.clientId || se.id;
            const serverCategoryId = se.categoryId ?? se.category?.id ?? undefined;
            const serverDiscount = se.discountAmount != null ? Number(se.discountAmount) : undefined;
            const localExpense = localById.get(expenseId);
            const serverProjectId = se.projectExpenses && Array.isArray(se.projectExpenses) && se.projectExpenses.length > 0
              ? (se.projectExpenses[0].projectId ?? se.projectExpenses[0].project?.id)
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
              debtContactName: decrypted.debtContactName ?? undefined,
              debtDueDate: decrypted.debtDueDate ? new Date(decrypted.debtDueDate) : undefined,
              relatedDebtIncomeId: decrypted.relatedDebtIncomeId ?? undefined,
              createdByUserName: se.createdByUserName ?? null,
              createdAt: new Date(decrypted.createdAt),
              updatedAt: new Date(decrypted.updatedAt),
              isDeleted: decrypted.isDeleted || false,
              syncStatus: 'synced' as SyncStatus,
              syncVersion: decrypted.syncVersion || 0,
            };
          });

          // -------- PHASE D: single SQLite transaction for ALL writes --------
          const serverIdSet = new Set<string>(serverExpenses.map((se: any) => se.clientId || se.id));
          await withTransaction(async () => {
              // 1) Dedup'd categories/projects — each upserted ONCE
              for (const c of categoryUpserts.values()) {
                try { await upsertCategory(c); } catch { /* skip */ }
              }
              for (const p of projectUpserts.values()) {
                try { await upsertProject(p); } catch { /* skip */ }
              }
              // 2) Expenses
              for (const e of builtExpenses) {
                await upsertExpense(e);
              }
              // 3) Per-expense extras (items / splits / tags / project links)
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

                if (se.categorySplits && Array.isArray(se.categorySplits) && se.categorySplits.length > 0) {
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

                if (se.expenseTags && Array.isArray(se.expenseTags) && se.expenseTags.length > 0) {
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

                if (se.projectExpenses && Array.isArray(se.projectExpenses) && se.projectExpenses.length > 0) {
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
              // 4) Soft-delete locals that the server no longer returns
              for (const local of localExpenses) {
                if (local.syncStatus === 'synced' && !serverIdSet.has(local.id)) {
                  await softDeleteExpenseInDb(local.id, new Date());
                }
              }
            });

          // Reload from SQLite after merge
          const merged = await loadAllExpenses(accountId);
          // Guard: abort if account switched during merge
          if (useAccountStore.getState().currentAccountId !== accountId) return;

          // Populate projectId from project_expenses join table
          const mergedMappings = await getAllProjectExpenseMappings(accountId);
          const mergedProjectMap = new Map<string, string>();
          for (const m of mergedMappings) {
            mergedProjectMap.set(m.expenseId, m.projectId);
          }
          for (const exp of merged) {
            const pid = mergedProjectMap.get(exp.id);
            if (pid) exp.projectId = pid;
          }

          set({ expenses: merged });
          setLastSyncTime(Date.now());
          _lastExpensesSyncAt = Date.now();
          _lastExpensesSyncedAccountId = accountId;

          // Refresh category and project stores so UI picks up newly synced data.
          // AWAITED — fire-and-forget caused background SQLite contention with the
          // very next hydrateTransactions cycle (followups paid 200-400ms extra).
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
      })();
      _loadExpensesInflight.finally(() => { _loadExpensesInflight = null; });
      return _loadExpensesInflight;
    },

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
      // Resolve category IDs to names for the server (local default IDs don't exist on server)
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
      // Also update SQLite so loadExpenses() won't revert to 'pending'
      updateExpenseInDb(id, {}, new Date(), 'synced').catch(() => {});

      // Encrypt sensitive fields before sending to server
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
        // Expected when offline — the row stays 'pending' and syncPendingExpenses
        // retries on reconnect. warn (not error) so RN LogBox doesn't red-screen.
        console.warn('Expense sync deferred (offline?):', e);
      });

      // Fire-and-forget gamification check
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
          // Expected offline; local SQLite already updated + marked pending.
          console.warn('Expense update sync deferred (offline?):', e),
        );
      }
    },

    // Assign/clear the project for an existing expense. projectId lives in the
    // project_expenses join table (not an expenses column), so the generic
    // updateExpense can't manage it — and `undefined` would be dropped from the
    // JSON body, making it impossible to clear server-side. We handle all three
    // layers here: in-memory, local SQLite join table, and server (explicit null).
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
        if (oldProjectId) {
          await removeExpenseFromProject(oldProjectId, expenseId);
        }
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

      // Explicit null clears the association server-side (DTO accepts string | null).
      api.updateExpense(expenseId, { projectId }).catch((e) =>
        // Expected offline; local join table already updated.
        console.warn('Expense project sync deferred (offline?):', e),
      );
    },

    deleteExpense: (id) => {
      set((state) => ({
        expenses: state.expenses.filter((e) => e.id !== id),
      }));

      softDeleteExpenseInDb(id, new Date()).catch((e) =>
        console.error('Failed to soft-delete expense in SQLite:', e),
      );

      api.deleteExpense(id).catch((e) =>
        // Expected offline; local row soft-deleted + marked pending.
        console.warn('Expense delete sync deferred (offline?):', e),
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
        // Expected offline; local item already soft-deleted.
        console.warn('Expense item delete sync deferred (offline?):', e),
      );
    },

    // ---- Receipt Image ----

    loadReceiptImage: async (expenseId: string): Promise<{ base64: string; mimeType: string } | null> => {
      try {
        // Local first — opens the receipt instantly when cached, no network.
        const local = await getReceiptImageFromDb(expenseId);
        if (local) return local;

        // Fallback: server (e.g. on a fresh device that hasn't synced this receipt yet).
        try {
          const result = await api.getReceiptImage(expenseId);
          if (result?.imageBase64) {
            const mimeType = result.mimeType || 'image/jpeg';
            await saveReceiptImageLocally(expenseId, result.imageBase64, mimeType);
            return { base64: result.imageBase64, mimeType };
          }
        } catch {
          // Offline or no receipt on server — fall through to null.
        }

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
          // Expected offline; receipt is stored locally and re-syncs later.
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

    // ---- Sync ----

    syncPendingExpenses: async () => {
      const pending = get().expenses.filter(
        (e) => e.syncStatus === 'pending' && !e.isDeleted,
      );
      if (pending.length === 0) return;

      for (const expense of pending) {
        try {
          // Get tags and project for this expense from local SQLite
          const localTags = await getTagsForExpense(expense.id);
          const localProjectId = await getProjectIdForExpense(expense.id);

          // Encrypt before sending
          const { payload: encPayload, encryptedPayload, encryptionKeyVersion } = await maybeEncrypt('expense', {
            description: expense.description,
            notes: expense.notes,
            merchant: expense.merchant,
            debtContactName: expense.debtContactName,
            amount: expense.amount,
            discountAmount: expense.discountAmount,
          }, expense.accountId);

          await api.createExpense({
            localId: expense.localId || expense.id,
            amount: encPayload.amount ?? expense.amount,
            discountAmount: encPayload.discountAmount ?? expense.discountAmount,
            currencyCode: expense.currencyCode,
            description: encPayload.description ?? expense.description,
            notes: encPayload.notes ?? expense.notes,
            merchant: encPayload.merchant ?? expense.merchant,
            categoryId: expense.categoryId || undefined,
            tagIds: localTags.length > 0 ? localTags.map(t => t.id) : undefined,
            projectId: localProjectId || undefined,
            date: expense.date instanceof Date ? expense.date.toISOString() : String(expense.date),
            source: expense.source,
            isDebt: expense.isDebt || undefined,
            isDebtRepayment: expense.isDebtRepayment || undefined,
            debtContactName: encPayload.debtContactName ?? expense.debtContactName,
            debtDueDate: expense.debtDueDate ? (expense.debtDueDate instanceof Date ? expense.debtDueDate.toISOString() : String(expense.debtDueDate)) : undefined,
            relatedDebtIncomeId: expense.relatedDebtIncomeId || undefined,
            encryptedPayload,
            encryptionKeyVersion,
          } as any);
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

    reset: () =>
      set({ expenses: [], expenseItems: {}, isLoading: false, error: null, totalThisMonth: 0, expenseTotalsByCurrency: {} }),

    // ---- Selectors ----

    getFilteredExpenses: () => {
      const { expenses, filters } = get();
      let filtered = expenses.filter((e) => !e.isDeleted);

      // Apply date range filter
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

      // Apply category filter
      if (filters.categoryId) {
        filtered = filtered.filter((e) => e.categoryId === filters.categoryId);
      }

      // Apply merchant filter (multi-select)
      if (filters.merchants.length > 0) {
        filtered = filtered.filter((e) => e.merchant != null && filters.merchants.includes(e.merchant));
      }

      // Apply search filter
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        filtered = filtered.filter(
          (e) =>
            e.description?.toLowerCase().includes(query) ||
            e.notes?.toLowerCase().includes(query) ||
            e.merchant?.toLowerCase().includes(query)
        );
      }

      // Sort by date descending
      return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },

    getDistinctMerchants: () => computeDistinctMerchants(get().expenses),

    getMerchantCounts: () => computeMerchantCounts(get().expenses),

    // Bulk rename/merge/delete a merchant across the account's expenses.
    // Renaming to an existing name merges; to = null clears. Reuses the offline
    // sync path (syncPendingExpenses re-encrypts for E2EE accounts).
    renameMerchant: async (from, to) => {
      if (to === from) return 0;
      const accountId = useAccountStore.getState().currentAccountId || '';
      const affected = get().expenses.filter((e) => !e.isDeleted && e.merchant === from);
      if (affected.length === 0) return 0;
      const now = new Date();
      set((state) => ({
        expenses: state.expenses.map((e) =>
          !e.isDeleted && e.merchant === from
            ? {
                ...e,
                merchant: to || undefined,
                updatedAt: now,
                syncStatus: 'pending' as SyncStatus,
              }
            : e
        ),
      }));
      try {
        await bulkRenameMerchant(accountId, from, to);
      } catch (e) {
        console.error('Failed to bulk-rename merchant in SQLite:', e);
      }
      get().syncPendingExpenses().catch((e) =>
        // Expected offline; rows marked pending re-sync on reconnect.
        console.warn('Merchant rename sync deferred (offline?):', e),
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
        categoryMap.set(key, {
          amount: current.amount + expense.amount,
          count: current.count + 1,
        });
      });

      const breakdown: CategoryBreakdown[] = Array.from(categoryMap.entries()).map(
        ([categoryId, data]) => ({
          categoryId,
          name: categoryId || i18n.t('common.uncategorized'),
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

    // Update Android widget data (debounced, fire-and-forget)
    clearTimeout((globalThis as any).__widgetRefreshTimer);
    (globalThis as any).__widgetRefreshTimer = setTimeout(() => {
      const { refreshWidgetData } = require('@/services/widgetData');
      refreshWidgetData();
    }, 1000);
  },
);
