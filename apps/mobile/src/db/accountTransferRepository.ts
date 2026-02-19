import { executeSql } from './client';
import type { AccountTransfer, Currency, SyncStatus } from '@budget/shared-types';

interface AccountTransferRow {
  id: string;
  local_id: string;
  server_id: string | null;
  user_id: string;
  from_account_id: string;
  from_currency: string;
  from_amount: number;
  to_account_id: string;
  to_currency: string;
  to_amount: number;
  exchange_rate: number;
  date: number;
  notes: string | null;
  count_as_income: number;
  linked_income_id: string | null;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  sync_status: string;
  sync_version: number;
}

function rowToTransfer(row: AccountTransferRow): AccountTransfer {
  return {
    id: row.id,
    localId: row.local_id,
    serverId: row.server_id ?? undefined,
    userId: row.user_id,
    fromAccountId: row.from_account_id,
    fromCurrency: row.from_currency as Currency,
    fromAmount: row.from_amount,
    toAccountId: row.to_account_id,
    toCurrency: row.to_currency as Currency,
    toAmount: row.to_amount,
    exchangeRate: row.exchange_rate,
    date: new Date(row.date),
    notes: row.notes ?? undefined,
    countAsIncome: row.count_as_income === 1,
    linkedIncomeId: row.linked_income_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    isDeleted: row.is_deleted === 1,
    syncStatus: row.sync_status as SyncStatus,
    syncVersion: row.sync_version,
  };
}

export async function loadAllTransfers(userId: string): Promise<AccountTransfer[]> {
  const rows = await executeSql<AccountTransferRow>(
    'SELECT * FROM account_transfers WHERE user_id = ? AND is_deleted = 0 ORDER BY date DESC',
    [userId],
  );
  return rows.map(rowToTransfer);
}

export async function loadTransfersByAccount(accountId: string): Promise<AccountTransfer[]> {
  const rows = await executeSql<AccountTransferRow>(
    'SELECT * FROM account_transfers WHERE (from_account_id = ? OR to_account_id = ?) AND is_deleted = 0 ORDER BY date DESC',
    [accountId, accountId],
  );
  return rows.map(rowToTransfer);
}

export async function insertTransfer(transfer: AccountTransfer): Promise<void> {
  await executeSql(
    `INSERT OR REPLACE INTO account_transfers (
      id, local_id, server_id, user_id,
      from_account_id, from_currency, from_amount,
      to_account_id, to_currency, to_amount,
      exchange_rate, date, notes,
      count_as_income, linked_income_id,
      created_at, updated_at, is_deleted, sync_status, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      transfer.id,
      transfer.localId,
      transfer.serverId ?? null,
      transfer.userId,
      transfer.fromAccountId,
      transfer.fromCurrency,
      transfer.fromAmount,
      transfer.toAccountId,
      transfer.toCurrency,
      transfer.toAmount,
      transfer.exchangeRate,
      transfer.date instanceof Date ? transfer.date.getTime() : transfer.date,
      transfer.notes ?? null,
      transfer.countAsIncome ? 1 : 0,
      transfer.linkedIncomeId ?? null,
      transfer.createdAt instanceof Date ? transfer.createdAt.getTime() : transfer.createdAt,
      transfer.updatedAt instanceof Date ? transfer.updatedAt.getTime() : transfer.updatedAt,
      transfer.isDeleted ? 1 : 0,
      transfer.syncStatus,
      transfer.syncVersion,
    ],
  );
}

export async function updateTransferInDb(
  id: string,
  updates: Partial<AccountTransfer>,
  updatedAt: Date,
  syncStatus: string,
): Promise<void> {
  const setClauses: string[] = [];
  const params: (string | number | null)[] = [];

  if (updates.fromAmount !== undefined) {
    setClauses.push('from_amount = ?');
    params.push(updates.fromAmount);
  }
  if (updates.toAmount !== undefined) {
    setClauses.push('to_amount = ?');
    params.push(updates.toAmount);
  }
  if (updates.exchangeRate !== undefined) {
    setClauses.push('exchange_rate = ?');
    params.push(updates.exchangeRate);
  }
  if (updates.date !== undefined) {
    setClauses.push('date = ?');
    params.push(updates.date instanceof Date ? updates.date.getTime() : updates.date);
  }
  if (updates.notes !== undefined) {
    setClauses.push('notes = ?');
    params.push(updates.notes ?? null);
  }
  if (updates.countAsIncome !== undefined) {
    setClauses.push('count_as_income = ?');
    params.push(updates.countAsIncome ? 1 : 0);
  }

  if (setClauses.length === 0) return;

  setClauses.push('updated_at = ?');
  params.push(updatedAt.getTime());
  setClauses.push('sync_status = ?');
  params.push(syncStatus);

  params.push(id);

  await executeSql(
    `UPDATE account_transfers SET ${setClauses.join(', ')} WHERE id = ?`,
    params,
  );
}

export async function softDeleteTransfer(id: string, updatedAt: Date): Promise<void> {
  await executeSql(
    'UPDATE account_transfers SET is_deleted = 1, updated_at = ?, sync_status = ? WHERE id = ?',
    [updatedAt.getTime(), 'pending', id],
  );
}

export async function clearAllTransfers(): Promise<void> {
  await executeSql('DELETE FROM account_transfers', []);
}
