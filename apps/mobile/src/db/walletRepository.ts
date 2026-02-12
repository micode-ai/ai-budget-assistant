import { executeSql } from './client';
import type { WalletBalance, Currency, SyncStatus } from '@budget/shared-types';

interface WalletBalanceRow {
  id: string;
  local_id: string;
  server_id: string | null;
  account_id: string;
  user_id: string;
  currency_code: string;
  initial_amount: number;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  sync_status: string;
  sync_version: number;
}

function rowToWalletBalance(row: WalletBalanceRow): WalletBalance {
  return {
    id: row.id,
    localId: row.local_id,
    serverId: row.server_id ?? undefined,
    accountId: row.account_id,
    userId: row.user_id,
    currencyCode: row.currency_code as Currency,
    initialAmount: row.initial_amount,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    isDeleted: row.is_deleted === 1,
    syncStatus: row.sync_status as SyncStatus,
    syncVersion: row.sync_version,
  };
}

export async function loadAllWalletBalances(accountId: string): Promise<WalletBalance[]> {
  const rows = await executeSql<WalletBalanceRow>(
    'SELECT * FROM wallet_balances WHERE account_id = ? AND is_deleted = 0 ORDER BY currency_code ASC',
    [accountId],
  );
  return rows.map(rowToWalletBalance);
}

export async function upsertWalletBalance(balance: WalletBalance): Promise<void> {
  await executeSql(
    `INSERT OR REPLACE INTO wallet_balances (
      id, local_id, server_id, account_id, user_id, currency_code, initial_amount,
      created_at, updated_at, is_deleted, sync_status, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      balance.id,
      balance.localId,
      balance.serverId ?? null,
      balance.accountId,
      balance.userId,
      balance.currencyCode,
      balance.initialAmount,
      balance.createdAt instanceof Date ? balance.createdAt.getTime() : balance.createdAt,
      balance.updatedAt instanceof Date ? balance.updatedAt.getTime() : balance.updatedAt,
      balance.isDeleted ? 1 : 0,
      balance.syncStatus,
      balance.syncVersion,
    ],
  );
}

export async function softDeleteWalletBalance(id: string, updatedAt: Date): Promise<void> {
  await executeSql(
    'UPDATE wallet_balances SET is_deleted = 1, updated_at = ?, sync_status = ? WHERE id = ?',
    [updatedAt.getTime(), 'pending', id],
  );
}

export async function clearAllWalletBalances(): Promise<void> {
  await executeSql('DELETE FROM wallet_balances', []);
}

export async function getExpenseTotalsByCurrency(accountId: string): Promise<Record<string, number>> {
  const rows = await executeSql<{ currency_code: string; total: number }>(
    `SELECT currency_code, SUM(amount) as total
     FROM expenses
     WHERE account_id = ? AND is_deleted = 0
     GROUP BY currency_code`,
    [accountId],
  );
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.currency_code] = row.total;
  }
  return result;
}

export async function getIncomeTotalsByCurrency(accountId: string): Promise<Record<string, number>> {
  const rows = await executeSql<{ currency_code: string; total: number }>(
    `SELECT currency_code, SUM(amount) as total
     FROM incomes
     WHERE account_id = ? AND is_deleted = 0
     GROUP BY currency_code`,
    [accountId],
  );
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.currency_code] = row.total;
  }
  return result;
}

export async function getExchangeTotals(accountId: string): Promise<{
  exchangedIn: Record<string, number>;
  exchangedOut: Record<string, number>;
}> {
  const inRows = await executeSql<{ to_currency: string; total: number }>(
    `SELECT to_currency, SUM(to_amount) as total
     FROM currency_exchanges
     WHERE account_id = ? AND is_deleted = 0
     GROUP BY to_currency`,
    [accountId],
  );
  const outRows = await executeSql<{ from_currency: string; total: number }>(
    `SELECT from_currency, SUM(from_amount) as total
     FROM currency_exchanges
     WHERE account_id = ? AND is_deleted = 0
     GROUP BY from_currency`,
    [accountId],
  );

  const exchangedIn: Record<string, number> = {};
  const exchangedOut: Record<string, number> = {};
  for (const row of inRows) exchangedIn[row.to_currency] = row.total;
  for (const row of outRows) exchangedOut[row.from_currency] = row.total;
  return { exchangedIn, exchangedOut };
}

export async function getTransferTotals(accountId: string): Promise<{
  transferredIn: Record<string, number>;
  transferredOut: Record<string, number>;
}> {
  const inRows = await executeSql<{ to_currency: string; total: number }>(
    `SELECT to_currency, SUM(to_amount) as total
     FROM account_transfers
     WHERE to_account_id = ? AND is_deleted = 0
     GROUP BY to_currency`,
    [accountId],
  );
  const outRows = await executeSql<{ from_currency: string; total: number }>(
    `SELECT from_currency, SUM(from_amount) as total
     FROM account_transfers
     WHERE from_account_id = ? AND is_deleted = 0
     GROUP BY from_currency`,
    [accountId],
  );

  const transferredIn: Record<string, number> = {};
  const transferredOut: Record<string, number> = {};
  for (const row of inRows) transferredIn[row.to_currency] = row.total;
  for (const row of outRows) transferredOut[row.from_currency] = row.total;
  return { transferredIn, transferredOut };
}
