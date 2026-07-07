import { executeSql } from './client';
import type { ShoppingList, SyncStatus } from '@budget/shared-types';

interface ShoppingListRow {
  id: string;
  account_id: string;
  client_id: string;
  name: string;
  is_default: number;
  is_archived: number;
  sort_order: number;
  created_by_user_id: string | null;
  is_deleted: number;
  sync_status: string;
  sync_version: number;
  created_at: number;
  updated_at: number;
}

// Local-only bookkeeping fields layered on top of the shared-types `ShoppingList`
// DTO, which carries no sync/timestamp metadata. Mirrors how `projectRepository.ts`'s
// `Project` entity carries these fields directly — here they live on this extended
// write-side type instead, since `ShoppingList` itself doesn't declare them.
export interface ShoppingListLocal extends ShoppingList {
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export function rowToShoppingList(row: ShoppingListRow): ShoppingList {
  return {
    id: row.id,
    accountId: row.account_id,
    clientId: row.client_id,
    name: row.name,
    isDefault: row.is_default === 1,
    isArchived: row.is_archived === 1,
    sortOrder: row.sort_order,
    createdByUserId: row.created_by_user_id ?? '',
    items: [],
  };
}

function rowToShoppingListLocal(row: ShoppingListRow): ShoppingListLocal {
  return {
    ...rowToShoppingList(row),
    isDeleted: row.is_deleted === 1,
    syncStatus: row.sync_status as SyncStatus,
    syncVersion: row.sync_version,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function shoppingListToParams(list: ShoppingListLocal): (string | number | null)[] {
  return [
    list.id,
    list.accountId,
    list.clientId,
    list.name,
    list.isDefault ? 1 : 0,
    list.isArchived ? 1 : 0,
    list.sortOrder,
    list.createdByUserId ?? null,
    list.isDeleted ? 1 : 0,
    list.syncStatus,
    list.syncVersion,
    list.createdAt.getTime(),
    list.updatedAt.getTime(),
  ];
}

export async function upsertShoppingList(list: ShoppingListLocal): Promise<void> {
  await executeSql(
    `INSERT INTO shopping_lists (
      id, account_id, client_id, name, is_default, is_archived, sort_order,
      created_by_user_id, is_deleted, sync_status, sync_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      account_id = excluded.account_id,
      client_id = excluded.client_id,
      name = excluded.name,
      is_default = excluded.is_default,
      is_archived = excluded.is_archived,
      sort_order = excluded.sort_order,
      created_by_user_id = excluded.created_by_user_id,
      is_deleted = excluded.is_deleted,
      sync_status = excluded.sync_status,
      sync_version = excluded.sync_version,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at`,
    shoppingListToParams(list),
  );
}

export async function getAllShoppingLists(accountId: string): Promise<ShoppingList[]> {
  const rows = await executeSql<ShoppingListRow>(
    'SELECT * FROM shopping_lists WHERE account_id = ? AND is_deleted = 0 AND is_archived = 0 ORDER BY sort_order, created_at',
    [accountId],
  );
  return rows.map(rowToShoppingList);
}

export async function deleteShoppingList(id: string): Promise<void> {
  await executeSql(
    `UPDATE shopping_lists SET is_deleted = 1, sync_status = 'pending', updated_at = ? WHERE id = ?`,
    [Date.now(), id],
  );
}

export async function getPendingShoppingLists(accountId: string): Promise<ShoppingListLocal[]> {
  const rows = await executeSql<ShoppingListRow>(
    `SELECT * FROM shopping_lists WHERE account_id = ? AND sync_status = 'pending'`,
    [accountId],
  );
  return rows.map(rowToShoppingListLocal);
}

export async function markShoppingListSynced(id: string, serverId?: string): Promise<void> {
  await executeSql(
    `UPDATE shopping_lists SET sync_status = 'synced', id = COALESCE(?, id) WHERE id = ?`,
    [serverId ?? null, id],
  );
}
