import { executeSql } from './client';
import type { Expense, Currency, SyncStatus, ExpenseSource, RecurringPeriod } from '@budget/shared-types';

interface ExpenseRow {
  id: string;
  local_id: string;
  server_id: string | null;
  user_id: string;
  account_id: string;
  amount: number;
  discount_amount: number | null;
  currency_code: string;
  description: string | null;
  notes: string | null;
  merchant: string | null;
  category_id: string | null;
  date: number;
  time: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_name: string | null;
  receipt_url: string | null;
  is_recurring: number;
  recurring_id: string | null;
  recurring_period: string | null;
  source: string;
  is_debt: number;
  is_debt_repayment: number;
  debt_contact_name: string | null;
  debt_due_date: number | null;
  related_debt_income_id: string | null;
  created_by_user_name: string | null;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  sync_status: string;
  sync_version: number;
}

function rowToExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    localId: row.local_id,
    serverId: row.server_id ?? undefined,
    userId: row.user_id,
    accountId: row.account_id,
    amount: row.amount,
    discountAmount: row.discount_amount ?? undefined,
    currencyCode: row.currency_code as Currency,
    description: row.description ?? undefined,
    notes: row.notes ?? undefined,
    merchant: row.merchant ?? undefined,
    categoryId: row.category_id ?? undefined,
    date: new Date(row.date),
    time: row.time ?? undefined,
    location:
      row.location_lat != null && row.location_lng != null
        ? {
            lat: row.location_lat,
            lng: row.location_lng,
            name: row.location_name ?? undefined,
          }
        : undefined,
    receiptUrl: row.receipt_url ?? undefined,
    isRecurring: row.is_recurring === 1,
    recurringId: row.recurring_id ?? undefined,
    recurringPeriod: (row.recurring_period as RecurringPeriod) ?? undefined,
    source: row.source as ExpenseSource,
    isDebt: row.is_debt === 1,
    isDebtRepayment: row.is_debt_repayment === 1,
    debtContactName: row.debt_contact_name ?? undefined,
    debtDueDate: row.debt_due_date ? new Date(row.debt_due_date) : undefined,
    relatedDebtIncomeId: row.related_debt_income_id ?? undefined,
    createdByUserName: row.created_by_user_name ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    isDeleted: row.is_deleted === 1,
    syncStatus: row.sync_status as SyncStatus,
    syncVersion: row.sync_version,
  };
}

function expenseToParams(expense: Expense): (string | number | null)[] {
  return [
    expense.id,
    expense.localId,
    expense.serverId ?? null,
    expense.userId,
    expense.accountId,
    expense.amount,
    expense.discountAmount ?? null,
    expense.currencyCode,
    expense.description ?? null,
    expense.notes ?? null,
    expense.merchant ?? null,
    expense.categoryId ?? null,
    expense.date.getTime(),
    expense.time ?? null,
    expense.location?.lat ?? null,
    expense.location?.lng ?? null,
    expense.location?.name ?? null,
    expense.receiptUrl ?? null,
    expense.isRecurring ? 1 : 0,
    expense.recurringId ?? null,
    expense.recurringPeriod ?? null,
    expense.source,
    expense.isDebt ? 1 : 0,
    expense.isDebtRepayment ? 1 : 0,
    expense.debtContactName ?? null,
    expense.debtDueDate ? expense.debtDueDate.getTime() : null,
    expense.relatedDebtIncomeId ?? null,
    expense.createdByUserName ?? null,
    expense.createdAt.getTime(),
    expense.updatedAt.getTime(),
    expense.isDeleted ? 1 : 0,
    expense.syncStatus,
    expense.syncVersion,
  ];
}

export async function loadAllExpenses(accountId?: string): Promise<Expense[]> {
  if (accountId) {
    const rows = await executeSql<ExpenseRow>(
      'SELECT * FROM expenses WHERE is_deleted = 0 AND account_id = ? ORDER BY date DESC',
      [accountId],
    );
    return rows.map(rowToExpense);
  }
  const rows = await executeSql<ExpenseRow>(
    'SELECT * FROM expenses WHERE is_deleted = 0 ORDER BY date DESC',
  );
  return rows.map(rowToExpense);
}

export async function insertExpense(expense: Expense): Promise<void> {
  await executeSql(
    `INSERT INTO expenses (
      id, local_id, server_id, user_id, account_id, amount, discount_amount, currency_code,
      description, notes, merchant, category_id, date, time,
      location_lat, location_lng, location_name, receipt_url,
      is_recurring, recurring_id, recurring_period, source,
      is_debt, is_debt_repayment, debt_contact_name, debt_due_date, related_debt_income_id,
      created_by_user_name,
      created_at, updated_at,
      is_deleted, sync_status, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    expenseToParams(expense),
  );
}

export async function updateExpenseInDb(
  id: string,
  updates: Partial<Expense>,
  updatedAt: Date,
  syncStatus: string,
): Promise<void> {
  const setClauses: string[] = [];
  const params: (string | number | null)[] = [];

  if (updates.amount !== undefined) {
    setClauses.push('amount = ?');
    params.push(updates.amount);
  }
  if (updates.discountAmount !== undefined) {
    setClauses.push('discount_amount = ?');
    params.push(updates.discountAmount ?? null);
  }
  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    params.push(updates.description ?? null);
  }
  if (updates.merchant !== undefined) {
    setClauses.push('merchant = ?');
    params.push(updates.merchant ?? null);
  }
  if (updates.notes !== undefined) {
    setClauses.push('notes = ?');
    params.push(updates.notes ?? null);
  }
  if (updates.categoryId !== undefined) {
    setClauses.push('category_id = ?');
    params.push(updates.categoryId ?? null);
  }
  if (updates.currencyCode !== undefined) {
    setClauses.push('currency_code = ?');
    params.push(updates.currencyCode);
  }
  if (updates.date !== undefined) {
    setClauses.push('date = ?');
    params.push(updates.date instanceof Date ? updates.date.getTime() : updates.date);
  }
  if (updates.isRecurring !== undefined) {
    setClauses.push('is_recurring = ?');
    params.push(updates.isRecurring ? 1 : 0);
  }
  if (updates.recurringPeriod !== undefined) {
    setClauses.push('recurring_period = ?');
    params.push(updates.recurringPeriod ?? null);
  }
  if (updates.receiptUrl !== undefined) {
    setClauses.push('receipt_url = ?');
    params.push(updates.receiptUrl ?? null);
  }
  if (updates.location !== undefined) {
    setClauses.push('location_lat = ?');
    params.push(updates.location?.lat ?? null);
    setClauses.push('location_lng = ?');
    params.push(updates.location?.lng ?? null);
    setClauses.push('location_name = ?');
    params.push(updates.location?.name ?? null);
  }
  if (updates.isDebt !== undefined) {
    setClauses.push('is_debt = ?');
    params.push(updates.isDebt ? 1 : 0);
  }
  if (updates.isDebtRepayment !== undefined) {
    setClauses.push('is_debt_repayment = ?');
    params.push(updates.isDebtRepayment ? 1 : 0);
  }
  if (updates.debtContactName !== undefined) {
    setClauses.push('debt_contact_name = ?');
    params.push(updates.debtContactName ?? null);
  }
  if (updates.debtDueDate !== undefined) {
    setClauses.push('debt_due_date = ?');
    params.push(updates.debtDueDate instanceof Date ? updates.debtDueDate.getTime() : (updates.debtDueDate ?? null));
  }
  if (updates.relatedDebtIncomeId !== undefined) {
    setClauses.push('related_debt_income_id = ?');
    params.push(updates.relatedDebtIncomeId ?? null);
  }

  setClauses.push('updated_at = ?');
  params.push(updatedAt.getTime());
  setClauses.push('sync_status = ?');
  params.push(syncStatus);

  params.push(id);

  await executeSql(
    `UPDATE expenses SET ${setClauses.join(', ')} WHERE id = ?`,
    params,
  );
}

export async function saveReceiptImageLocally(
  expenseId: string,
  imageBase64: string,
  mimeType?: string,
): Promise<void> {
  await executeSql(
    'UPDATE expenses SET receipt_image = ?, receipt_image_mime = ?, updated_at = ?, sync_status = ? WHERE id = ?',
    [imageBase64, mimeType ?? 'image/jpeg', Date.now(), 'pending', expenseId],
  );
}

export async function getReceiptImageFromDb(
  expenseId: string,
): Promise<{ base64: string; mimeType: string } | null> {
  const rows = await executeSql<{ receipt_image: string | null; receipt_image_mime: string | null }>(
    'SELECT receipt_image, receipt_image_mime FROM expenses WHERE id = ?',
    [expenseId],
  );
  const row = rows[0];
  if (!row?.receipt_image) return null;
  return {
    base64: row.receipt_image,
    mimeType: row.receipt_image_mime ?? 'image/jpeg',
  };
}

export async function deleteReceiptImageLocally(
  expenseId: string,
): Promise<void> {
  await executeSql(
    'UPDATE expenses SET receipt_image = NULL, receipt_image_mime = NULL, updated_at = ?, sync_status = ? WHERE id = ?',
    [Date.now(), 'pending', expenseId],
  );
}

export async function upsertExpense(expense: Expense): Promise<void> {
  await executeSql(
    `INSERT INTO expenses (
      id, local_id, server_id, user_id, account_id, amount, discount_amount, currency_code,
      description, notes, merchant, category_id, date, time,
      location_lat, location_lng, location_name, receipt_url,
      is_recurring, recurring_id, recurring_period, source,
      is_debt, is_debt_repayment, debt_contact_name, debt_due_date, related_debt_income_id,
      created_by_user_name,
      created_at, updated_at,
      is_deleted, sync_status, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      local_id = excluded.local_id,
      server_id = excluded.server_id,
      user_id = excluded.user_id,
      account_id = excluded.account_id,
      amount = excluded.amount,
      discount_amount = COALESCE(excluded.discount_amount, discount_amount),
      currency_code = excluded.currency_code,
      description = excluded.description,
      notes = excluded.notes,
      merchant = excluded.merchant,
      category_id = COALESCE(excluded.category_id, category_id),
      date = excluded.date,
      time = excluded.time,
      location_lat = excluded.location_lat,
      location_lng = excluded.location_lng,
      location_name = excluded.location_name,
      receipt_url = excluded.receipt_url,
      is_recurring = excluded.is_recurring,
      recurring_id = excluded.recurring_id,
      recurring_period = excluded.recurring_period,
      source = excluded.source,
      is_debt = excluded.is_debt,
      is_debt_repayment = excluded.is_debt_repayment,
      debt_contact_name = excluded.debt_contact_name,
      debt_due_date = excluded.debt_due_date,
      related_debt_income_id = excluded.related_debt_income_id,
      created_by_user_name = COALESCE(excluded.created_by_user_name, created_by_user_name),
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      is_deleted = excluded.is_deleted,
      sync_status = excluded.sync_status,
      sync_version = excluded.sync_version`,
    expenseToParams(expense),
  );
}

export async function softDeleteExpenseInDb(
  id: string,
  updatedAt: Date,
): Promise<void> {
  await executeSql(
    'UPDATE expenses SET is_deleted = 1, updated_at = ?, sync_status = ? WHERE id = ?',
    [updatedAt.getTime(), 'pending', id],
  );
}

export async function clearAllExpenses(): Promise<void> {
  await executeSql('DELETE FROM expense_items', []);
  await executeSql('DELETE FROM expenses', []);
}

export async function loadDebtExpenses(accountId: string): Promise<Expense[]> {
  const rows = await executeSql<ExpenseRow>(
    'SELECT * FROM expenses WHERE is_deleted = 0 AND account_id = ? AND is_debt = 1 ORDER BY date DESC',
    [accountId],
  );
  return rows.map(rowToExpense);
}

export async function loadRepaymentExpensesForIncome(incomeId: string): Promise<Expense[]> {
  const rows = await executeSql<ExpenseRow>(
    'SELECT * FROM expenses WHERE is_deleted = 0 AND is_debt_repayment = 1 AND related_debt_income_id = ? ORDER BY date ASC',
    [incomeId],
  );
  return rows.map(rowToExpense);
}
