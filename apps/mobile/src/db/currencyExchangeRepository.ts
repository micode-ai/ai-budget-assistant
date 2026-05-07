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

export async function updateExchangeInDb(
  id: string,
  updates: Partial<CurrencyExchange>,
  updatedAt: Date,
  syncStatus: SyncStatus,
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.fromCurrency !== undefined) {
    fields.push('from_currency = ?');
    values.push(updates.fromCurrency);
  }
  if (updates.toCurrency !== undefined) {
    fields.push('to_currency = ?');
    values.push(updates.toCurrency);
  }
  if (updates.fromAmount !== undefined) {
    fields.push('from_amount = ?');
    values.push(updates.fromAmount);
  }
  if (updates.toAmount !== undefined) {
    fields.push('to_amount = ?');
    values.push(updates.toAmount);
  }
  if (updates.exchangeRate !== undefined) {
    fields.push('exchange_rate = ?');
    values.push(updates.exchangeRate);
  }
  if (updates.date !== undefined) {
    fields.push('date = ?');
    values.push(updates.date instanceof Date ? updates.date.getTime() : updates.date);
  }
  if (updates.notes !== undefined) {
    fields.push('notes = ?');
    values.push(updates.notes ?? null);
  }

  fields.push('updated_at = ?');
  values.push(updatedAt.getTime());
  fields.push('sync_status = ?');
  values.push(syncStatus);
  values.push(id);

  await executeSql(
    `UPDATE currency_exchanges SET ${fields.join(', ')} WHERE id = ?`,
    values,
  );
}

export async function softDeleteExchange(id: string, updatedAt: Date): Promise<void> {
  await executeSql(
    'UPDATE currency_exchanges SET is_deleted = 1, updated_at = ?, sync_status = ? WHERE id = ?',
    [updatedAt.getTime(), 'pending', id],
  );
}

export async function clearAllExchanges(): Promise<void> {
  await executeSql('DELETE FROM currency_exchanges', []);
}
