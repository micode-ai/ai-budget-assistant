import { executeSql } from './client';
import type { Income, Currency, SyncStatus } from '@budget/shared-types';

interface IncomeRow {
  id: string;
  local_id: string;
  server_id: string | null;
  user_id: string;
  account_id: string;
  amount: number;
  currency_code: string;
  description: string | null;
  notes: string | null;
  category_id: string | null;
  date: number;
  is_debt: number;
  is_debt_repayment: number;
  debt_contact_name: string | null;
  debt_due_date: number | null;
  related_debt_expense_id: string | null;
  created_by_user_name: string | null;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  sync_status: string;
  sync_version: number;
}

function rowToIncome(row: IncomeRow): Income {
  return {
    id: row.id,
    localId: row.local_id,
    serverId: row.server_id ?? undefined,
    userId: row.user_id,
    accountId: row.account_id,
    amount: row.amount,
    currencyCode: row.currency_code as Currency,
    description: row.description ?? undefined,
    notes: row.notes ?? undefined,
    categoryId: row.category_id ?? undefined,
    date: new Date(row.date),
    isDebt: row.is_debt === 1,
    isDebtRepayment: row.is_debt_repayment === 1,
    debtContactName: row.debt_contact_name ?? undefined,
    debtDueDate: row.debt_due_date ? new Date(row.debt_due_date) : undefined,
    relatedDebtExpenseId: row.related_debt_expense_id ?? undefined,
    createdByUserName: row.created_by_user_name ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    isDeleted: row.is_deleted === 1,
    syncStatus: row.sync_status as SyncStatus,
    syncVersion: row.sync_version,
  };
}

function incomeToParams(income: Income): (string | number | null)[] {
  return [
    income.id,
    income.localId,
    income.serverId ?? null,
    income.userId,
    income.accountId,
    income.amount,
    income.currencyCode,
    income.description ?? null,
    income.notes ?? null,
    income.categoryId ?? null,
    income.date.getTime(),
    income.isDebt ? 1 : 0,
    income.isDebtRepayment ? 1 : 0,
    income.debtContactName ?? null,
    income.debtDueDate ? income.debtDueDate.getTime() : null,
    income.relatedDebtExpenseId ?? null,
    income.createdByUserName ?? null,
    income.createdAt.getTime(),
    income.updatedAt.getTime(),
    income.isDeleted ? 1 : 0,
    income.syncStatus,
    income.syncVersion,
  ];
}

export async function loadAllIncomes(accountId?: string): Promise<Income[]> {
  if (accountId) {
    const rows = await executeSql<IncomeRow>(
      'SELECT * FROM incomes WHERE is_deleted = 0 AND account_id = ? ORDER BY date DESC',
      [accountId],
    );
    return rows.map(rowToIncome);
  }
  const rows = await executeSql<IncomeRow>(
    'SELECT * FROM incomes WHERE is_deleted = 0 ORDER BY date DESC',
  );
  return rows.map(rowToIncome);
}

export async function insertIncome(income: Income): Promise<void> {
  await executeSql(
    `INSERT INTO incomes (
      id, local_id, server_id, user_id, account_id, amount, currency_code,
      description, notes, category_id, date,
      is_debt, is_debt_repayment, debt_contact_name, debt_due_date, related_debt_expense_id,
      created_by_user_name,
      created_at, updated_at,
      is_deleted, sync_status, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    incomeToParams(income),
  );
}

export async function upsertIncome(income: Income): Promise<void> {
  await executeSql(
    `INSERT INTO incomes (
      id, local_id, server_id, user_id, account_id, amount, currency_code,
      description, notes, category_id, date,
      is_debt, is_debt_repayment, debt_contact_name, debt_due_date, related_debt_expense_id,
      created_by_user_name,
      created_at, updated_at,
      is_deleted, sync_status, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      local_id = excluded.local_id,
      server_id = excluded.server_id,
      user_id = excluded.user_id,
      account_id = excluded.account_id,
      amount = excluded.amount,
      currency_code = excluded.currency_code,
      description = excluded.description,
      notes = excluded.notes,
      category_id = COALESCE(excluded.category_id, category_id),
      date = excluded.date,
      is_debt = excluded.is_debt,
      is_debt_repayment = excluded.is_debt_repayment,
      debt_contact_name = excluded.debt_contact_name,
      debt_due_date = excluded.debt_due_date,
      related_debt_expense_id = excluded.related_debt_expense_id,
      created_by_user_name = COALESCE(excluded.created_by_user_name, created_by_user_name),
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      is_deleted = excluded.is_deleted,
      sync_status = excluded.sync_status,
      sync_version = excluded.sync_version`,
    incomeToParams(income),
  );
}

export async function updateIncomeInDb(
  id: string,
  updates: Partial<Income>,
  updatedAt: Date,
  syncStatus: string,
): Promise<void> {
  const setClauses: string[] = [];
  const params: (string | number | null)[] = [];

  if (updates.amount !== undefined) {
    setClauses.push('amount = ?');
    params.push(updates.amount);
  }
  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    params.push(updates.description ?? null);
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
  if (updates.relatedDebtExpenseId !== undefined) {
    setClauses.push('related_debt_expense_id = ?');
    params.push(updates.relatedDebtExpenseId ?? null);
  }

  setClauses.push('updated_at = ?');
  params.push(updatedAt.getTime());
  setClauses.push('sync_status = ?');
  params.push(syncStatus);

  params.push(id);

  await executeSql(
    `UPDATE incomes SET ${setClauses.join(', ')} WHERE id = ?`,
    params,
  );
}

export async function softDeleteIncomeInDb(
  id: string,
  updatedAt: Date,
): Promise<void> {
  await executeSql(
    'UPDATE incomes SET is_deleted = 1, updated_at = ?, sync_status = ? WHERE id = ?',
    [updatedAt.getTime(), 'pending', id],
  );
}

export async function clearAllIncomes(): Promise<void> {
  await executeSql('DELETE FROM incomes', []);
}

export async function loadDebtIncomes(accountId: string): Promise<Income[]> {
  const rows = await executeSql<IncomeRow>(
    'SELECT * FROM incomes WHERE is_deleted = 0 AND account_id = ? AND is_debt = 1 ORDER BY date DESC',
    [accountId],
  );
  return rows.map(rowToIncome);
}

export async function loadRepaymentIncomesForExpense(expenseId: string): Promise<Income[]> {
  const rows = await executeSql<IncomeRow>(
    'SELECT * FROM incomes WHERE is_deleted = 0 AND is_debt_repayment = 1 AND related_debt_expense_id = ? ORDER BY date ASC',
    [expenseId],
  );
  return rows.map(rowToIncome);
}
