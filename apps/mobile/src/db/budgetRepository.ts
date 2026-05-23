import { executeSql } from './client';
import type { Budget, BudgetPeriod, Currency, SyncStatus } from '@budget/shared-types';

interface BudgetRow {
  id: string;
  local_id: string;
  server_id: string | null;
  user_id: string;
  account_id: string;
  name: string;
  amount: number;
  currency_code: string;
  period: string;
  start_date: number;
  end_date: number | null;
  alert_threshold: number;
  is_active: number;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  sync_status: string;
  sync_version: number;
}

function rowToBudget(row: BudgetRow): Budget {
  return {
    id: row.id,
    localId: row.local_id,
    serverId: row.server_id ?? undefined,
    userId: row.user_id,
    accountId: row.account_id,
    name: row.name,
    amount: row.amount,
    currencyCode: row.currency_code as Currency,
    period: row.period as BudgetPeriod,
    startDate: new Date(row.start_date),
    endDate: row.end_date ? new Date(row.end_date) : undefined,
    alertThreshold: row.alert_threshold,
    isActive: row.is_active === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    isDeleted: row.is_deleted === 1,
    syncStatus: row.sync_status as SyncStatus,
    syncVersion: row.sync_version,
  };
}

function budgetToParams(budget: Budget): (string | number | null)[] {
  return [
    budget.id,
    budget.localId,
    budget.serverId ?? null,
    budget.userId,
    budget.accountId,
    budget.name,
    budget.amount,
    budget.currencyCode,
    budget.period,
    budget.startDate instanceof Date ? budget.startDate.getTime() : budget.startDate,
    budget.endDate instanceof Date ? budget.endDate.getTime() : (budget.endDate ?? null),
    budget.alertThreshold,
    budget.isActive ? 1 : 0,
    budget.createdAt instanceof Date ? budget.createdAt.getTime() : budget.createdAt,
    budget.updatedAt instanceof Date ? budget.updatedAt.getTime() : budget.updatedAt,
    budget.isDeleted ? 1 : 0,
    budget.syncStatus,
    budget.syncVersion,
  ];
}

export async function loadAllBudgets(accountId: string): Promise<Budget[]> {
  const rows = await executeSql<BudgetRow>(
    'SELECT * FROM budgets WHERE is_deleted = 0 AND account_id = ? ORDER BY created_at DESC',
    [accountId],
  );
  return rows.map(rowToBudget);
}

export async function insertBudget(budget: Budget): Promise<void> {
  await executeSql(
    `INSERT INTO budgets (
      id, local_id, server_id, user_id, account_id, name, amount, currency_code,
      period, start_date, end_date, alert_threshold, is_active,
      created_at, updated_at, is_deleted, sync_status, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    budgetToParams(budget),
  );
}

export async function upsertBudget(budget: Budget): Promise<void> {
  await executeSql(
    `INSERT INTO budgets (
      id, local_id, server_id, user_id, account_id, name, amount, currency_code,
      period, start_date, end_date, alert_threshold, is_active,
      created_at, updated_at, is_deleted, sync_status, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      local_id = excluded.local_id,
      server_id = excluded.server_id,
      user_id = excluded.user_id,
      account_id = excluded.account_id,
      name = excluded.name,
      amount = excluded.amount,
      currency_code = excluded.currency_code,
      period = excluded.period,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      alert_threshold = excluded.alert_threshold,
      is_active = excluded.is_active,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      is_deleted = excluded.is_deleted,
      sync_status = excluded.sync_status,
      sync_version = excluded.sync_version`,
    budgetToParams(budget),
  );
}

export async function updateBudgetInDb(
  id: string,
  updates: Partial<Budget>,
  updatedAt: Date,
  syncStatus: string,
): Promise<void> {
  const setClauses: string[] = [];
  const params: (string | number | null)[] = [];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    params.push(updates.name);
  }
  if (updates.amount !== undefined) {
    setClauses.push('amount = ?');
    params.push(updates.amount);
  }
  if (updates.currencyCode !== undefined) {
    setClauses.push('currency_code = ?');
    params.push(updates.currencyCode);
  }
  if (updates.period !== undefined) {
    setClauses.push('period = ?');
    params.push(updates.period);
  }
  if (updates.startDate !== undefined) {
    setClauses.push('start_date = ?');
    params.push(updates.startDate instanceof Date ? updates.startDate.getTime() : updates.startDate);
  }
  if (updates.endDate !== undefined) {
    setClauses.push('end_date = ?');
    params.push(updates.endDate instanceof Date ? updates.endDate.getTime() : (updates.endDate ?? null));
  }
  if (updates.alertThreshold !== undefined) {
    setClauses.push('alert_threshold = ?');
    params.push(updates.alertThreshold);
  }
  if (updates.isActive !== undefined) {
    setClauses.push('is_active = ?');
    params.push(updates.isActive ? 1 : 0);
  }

  setClauses.push('updated_at = ?');
  params.push(updatedAt.getTime());
  setClauses.push('sync_status = ?');
  params.push(syncStatus);

  params.push(id);

  await executeSql(
    `UPDATE budgets SET ${setClauses.join(', ')} WHERE id = ?`,
    params,
  );
}

export async function softDeleteBudgetInDb(
  id: string,
  updatedAt: Date,
): Promise<void> {
  await executeSql(
    'UPDATE budgets SET is_deleted = 1, updated_at = ?, sync_status = ? WHERE id = ?',
    [updatedAt.getTime(), 'pending', id],
  );
}

export async function clearAllBudgets(): Promise<void> {
  await executeSql('DELETE FROM budgets', []);
}
