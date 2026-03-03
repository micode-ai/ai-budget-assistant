import { executeSql } from './client';
import type { BudgetCategoryAllocation } from '@budget/shared-types';

interface BudgetCategoryRow {
  id: string;
  budget_id: string;
  category_id: string;
  amount: number;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  sync_version: number;
}

function rowToAllocation(row: BudgetCategoryRow): BudgetCategoryAllocation {
  return {
    id: row.id,
    budgetId: row.budget_id,
    categoryId: row.category_id,
    amount: row.amount,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    isDeleted: row.is_deleted === 1,
    syncVersion: row.sync_version,
  };
}

export async function getAllocationsForBudget(budgetId: string): Promise<BudgetCategoryAllocation[]> {
  const rows = await executeSql<BudgetCategoryRow>(
    'SELECT * FROM budget_categories WHERE budget_id = ? AND is_deleted = 0',
    [budgetId],
  );
  return rows.map(rowToAllocation);
}

export async function insertBudgetCategory(alloc: BudgetCategoryAllocation): Promise<void> {
  await executeSql(
    `INSERT INTO budget_categories (id, budget_id, category_id, amount, created_at, updated_at, is_deleted, sync_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      alloc.id,
      alloc.budgetId,
      alloc.categoryId,
      alloc.amount,
      alloc.createdAt.getTime(),
      alloc.updatedAt.getTime(),
      alloc.isDeleted ? 1 : 0,
      alloc.syncVersion,
    ],
  );
}

export async function upsertBudgetCategory(alloc: BudgetCategoryAllocation): Promise<void> {
  await executeSql(
    `INSERT INTO budget_categories (id, budget_id, category_id, amount, created_at, updated_at, is_deleted, sync_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       amount = excluded.amount,
       updated_at = excluded.updated_at,
       is_deleted = excluded.is_deleted,
       sync_version = excluded.sync_version`,
    [
      alloc.id,
      alloc.budgetId,
      alloc.categoryId,
      alloc.amount,
      alloc.createdAt.getTime(),
      alloc.updatedAt.getTime(),
      alloc.isDeleted ? 1 : 0,
      alloc.syncVersion,
    ],
  );
}

export async function deleteAllocationsForBudget(budgetId: string): Promise<void> {
  await executeSql(
    'DELETE FROM budget_categories WHERE budget_id = ?',
    [budgetId],
  );
}

export async function clearAllBudgetCategories(): Promise<void> {
  await executeSql('DELETE FROM budget_categories', []);
}
