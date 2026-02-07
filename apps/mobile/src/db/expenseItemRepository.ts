import { executeSql } from './client';
import type { ExpenseItem, SyncStatus } from '@budget/shared-types';

interface ExpenseItemRow {
  id: string;
  local_id: string;
  expense_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  sort_order: number;
  is_deleted: number;
  sync_status: string;
  sync_version: number;
  created_at: number;
  updated_at: number;
}

function rowToExpenseItem(row: ExpenseItemRow): ExpenseItem {
  return {
    id: row.id,
    localId: row.local_id,
    expenseId: row.expense_id,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    totalPrice: row.total_price,
    sortOrder: row.sort_order,
    isDeleted: row.is_deleted === 1,
    syncStatus: row.sync_status as SyncStatus,
    syncVersion: row.sync_version,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function expenseItemToParams(item: ExpenseItem): (string | number | null)[] {
  return [
    item.id,
    item.localId,
    item.expenseId,
    item.description,
    item.quantity,
    item.unitPrice,
    item.totalPrice,
    item.sortOrder,
    item.isDeleted ? 1 : 0,
    item.syncStatus,
    item.syncVersion,
    item.createdAt.getTime(),
    item.updatedAt.getTime(),
  ];
}

export async function loadItemsByExpenseId(expenseId: string): Promise<ExpenseItem[]> {
  const rows = await executeSql<ExpenseItemRow>(
    'SELECT * FROM expense_items WHERE expense_id = ? AND is_deleted = 0 ORDER BY sort_order ASC',
    [expenseId],
  );
  return rows.map(rowToExpenseItem);
}

export async function insertExpenseItem(item: ExpenseItem): Promise<void> {
  await executeSql(
    `INSERT INTO expense_items (
      id, local_id, expense_id, description, quantity, unit_price,
      total_price, sort_order, is_deleted, sync_status, sync_version,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    expenseItemToParams(item),
  );
}

export async function insertExpenseItems(items: ExpenseItem[]): Promise<void> {
  for (const item of items) {
    await insertExpenseItem(item);
  }
}

export async function updateExpenseItemInDb(
  id: string,
  updates: Partial<ExpenseItem>,
  updatedAt: Date,
  syncStatus: string,
): Promise<void> {
  const setClauses: string[] = [];
  const params: (string | number | null)[] = [];

  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    params.push(updates.description);
  }
  if (updates.quantity !== undefined) {
    setClauses.push('quantity = ?');
    params.push(updates.quantity);
  }
  if (updates.unitPrice !== undefined) {
    setClauses.push('unit_price = ?');
    params.push(updates.unitPrice);
  }
  if (updates.totalPrice !== undefined) {
    setClauses.push('total_price = ?');
    params.push(updates.totalPrice);
  }
  if (updates.sortOrder !== undefined) {
    setClauses.push('sort_order = ?');
    params.push(updates.sortOrder);
  }

  setClauses.push('updated_at = ?');
  params.push(updatedAt.getTime());
  setClauses.push('sync_status = ?');
  params.push(syncStatus);

  params.push(id);

  await executeSql(
    `UPDATE expense_items SET ${setClauses.join(', ')} WHERE id = ?`,
    params,
  );
}

export async function softDeleteExpenseItemInDb(
  id: string,
  updatedAt: Date,
): Promise<void> {
  await executeSql(
    'UPDATE expense_items SET is_deleted = 1, updated_at = ?, sync_status = ? WHERE id = ?',
    [updatedAt.getTime(), 'pending', id],
  );
}

export async function deleteItemsByExpenseId(expenseId: string): Promise<void> {
  await executeSql(
    'UPDATE expense_items SET is_deleted = 1, sync_status = ? WHERE expense_id = ?',
    ['pending', expenseId],
  );
}
