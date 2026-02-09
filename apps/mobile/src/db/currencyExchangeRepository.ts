import { executeSql } from './client';
import type { CurrencyExchange, Currency, SyncStatus } from '@budget/shared-types';

interface CurrencyExchangeRow {
  id: string;
  local_id: string;
  server_id: string | null;
  account_id: string;
  user_id: string;
  from_currency: string;
  to_currency: string;
  from_amount: number;
  to_amount: number;
  exchange_rate: number;
  date: number;
  notes: string | null;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  sync_status: string;
  sync_version: number;
}

function rowToExchange(row: CurrencyExchangeRow): CurrencyExchange {
  return {
    id: row.id,
    localId: row.local_id,
    serverId: row.server_id ?? undefined,
    accountId: row.account_id,
    userId: row.user_id,
    fromCurrency: row.from_currency as Currency,
    toCurrency: row.to_currency as Currency,
    fromAmount: row.from_amount,
    toAmount: row.to_amount,
    exchangeRate: row.exchange_rate,
    date: new Date(row.date),
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    isDeleted: row.is_deleted === 1,
    syncStatus: row.sync_status as SyncStatus,
    syncVersion: row.sync_version,
  };
}

export async function loadAllExchanges(accountId: string): Promise<CurrencyExchange[]> {
  const rows = await executeSql<CurrencyExchangeRow>(
    'SELECT * FROM currency_exchanges WHERE account_id = ? AND is_deleted = 0 ORDER BY date DESC',
    [accountId],
  );
  return rows.map(rowToExchange);
}

export async function insertExchange(exchange: CurrencyExchange): Promise<void> {
  await executeSql(
    `INSERT OR REPLACE INTO currency_exchanges (
      id, local_id, server_id, account_id, user_id,
      from_currency, to_currency, from_amount, to_amount, exchange_rate,
      date, notes, created_at, updated_at, is_deleted, sync_status, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      exchange.id,
      exchange.localId,
      exchange.serverId ?? null,
      exchange.accountId,
      exchange.userId,
      exchange.fromCurrency,
      exchange.toCurrency,
      exchange.fromAmount,
      exchange.toAmount,
      exchange.exchangeRate,
      exchange.date instanceof Date ? exchange.date.getTime() : exchange.date,
      exchange.notes ?? null,
      exchange.createdAt instanceof Date ? exchange.createdAt.getTime() : exchange.createdAt,
      exchange.updatedAt instanceof Date ? exchange.updatedAt.getTime() : exchange.updatedAt,
      exchange.isDeleted ? 1 : 0,
      exchange.syncStatus,
      exchange.syncVersion,
    ],
  );
}

export async function softDeleteExchange(id: string, updatedAt: Date): Promise<void> {
  await executeSql(
    'UPDATE currency_exchanges SET is_deleted = 1, updated_at = ?, sync_status = ? WHERE id = ?',
    [updatedAt.getTime(), 'pending', id],
  );
}
