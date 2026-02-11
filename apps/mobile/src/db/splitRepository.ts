import { executeSql } from './client';
import type { ExpenseCategorySplit } from '@budget/shared-types';

interface SplitRow {
  id: string;
  expense_id: string;
  category_id: string;
  amount: number;
  percentage: number;
  notes: string | null;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  sync_version: number;
}

function rowToSplit(row: SplitRow): ExpenseCategorySplit {
  return {
    id: row.id,
    expenseId: row.expense_id,
    categoryId: row.category_id,
    amount: row.amount,
    percentage: row.percentage,
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    isDeleted: row.is_deleted === 1,
    syncVersion: row.sync_version,
  };
}

function splitToParams(split: ExpenseCategorySplit): (string | number | null)[] {
  return [
    split.id,
    split.expenseId,
    split.categoryId,
    split.amount,
    split.percentage,
    split.notes ?? null,
    split.createdAt.getTime(),
    split.updatedAt.getTime(),
    split.isDeleted ? 1 : 0,
    split.syncVersion,
  ];
}

export async function insertSplit(split: ExpenseCategorySplit): Promise<void> {
  await executeSql(
    `INSERT INTO expense_category_splits (
      id, expense_id, category_id, amount, percentage, notes,
      created_at, updated_at, is_deleted, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    splitToParams(split),
  );
}

export async function getSplitsForExpense(expenseId: string): Promise<ExpenseCategorySplit[]> {
  const rows = await executeSql<SplitRow>(
    'SELECT * FROM expense_category_splits WHERE expense_id = ? AND is_deleted = 0 ORDER BY percentage DESC',
    [expenseId],
  );
  return rows.map(rowToSplit);
}

export async function deleteAllSplitsForExpense(expenseId: string): Promise<void> {
  await executeSql(
    'UPDATE expense_category_splits SET is_deleted = 1, updated_at = ? WHERE expense_id = ?',
    [Date.now(), expenseId],
  );
}
