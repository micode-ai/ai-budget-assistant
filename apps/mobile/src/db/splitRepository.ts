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

// Conservative margin under SQLite's default 999-bound-variable limit — one
// query per chunk, keyed on `expenseId` alone (no other bind params share the
// query), so this is also the max expense ids per IN(...) clause.
const SQLITE_IN_CLAUSE_CHUNK_SIZE = 900;

/**
 * Bulk sibling of `getSplitsForExpense` — a per-row read across a whole
 * account's expenses would be hundreds of queries (one per expense), so this
 * loads every expense's splits in one (or a few, chunked) `IN (...)` query
 * instead. Used by the expense pull-and-merge path to hydrate `expense.splits`
 * for the in-memory list that `useCategoryAnalytics` groups by.
 */
export async function getSplitsForExpenses(
  expenseIds: string[],
): Promise<Map<string, ExpenseCategorySplit[]>> {
  const result = new Map<string, ExpenseCategorySplit[]>();
  const uniqueIds = Array.from(new Set(expenseIds));
  if (uniqueIds.length === 0) return result;

  for (let i = 0; i < uniqueIds.length; i += SQLITE_IN_CLAUSE_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + SQLITE_IN_CLAUSE_CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = await executeSql<SplitRow>(
      `SELECT * FROM expense_category_splits WHERE expense_id IN (${placeholders}) AND is_deleted = 0 ORDER BY percentage DESC`,
      chunk,
    );
    for (const row of rows) {
      const split = rowToSplit(row);
      const existing = result.get(split.expenseId);
      if (existing) existing.push(split);
      else result.set(split.expenseId, [split]);
    }
  }

  return result;
}

export async function deleteAllSplitsForExpense(expenseId: string): Promise<void> {
  await executeSql(
    'UPDATE expense_category_splits SET is_deleted = 1, updated_at = ? WHERE expense_id = ?',
    [Date.now(), expenseId],
  );
}
