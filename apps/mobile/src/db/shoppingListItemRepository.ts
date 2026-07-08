import { executeSql } from './client';
import type { ShoppingListItem, SyncStatus } from '@budget/shared-types';

interface ShoppingListItemRow {
  id: string;
  account_id: string;
  shopping_list_id: string;
  client_id: string;
  canonical_name: string | null;
  raw_label: string;
  quantity: number;
  note: string | null;
  is_checked: number;
  added_by_user_id: string | null;
  sort_order: number;
  is_deleted: number;
  sync_status: string;
  sync_version: number;
  created_at: number;
  updated_at: number;
}

// Local-only bookkeeping fields layered on top of the shared-types `ShoppingListItem`
// DTO, which carries no `accountId`/sync/timestamp metadata. Mirrors
// `shoppingListRepository.ts`'s `ShoppingListLocal`.
export interface ShoppingListItemLocal extends ShoppingListItem {
  accountId: string;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export function rowToShoppingListItem(row: ShoppingListItemRow): ShoppingListItem {
  return {
    id: row.id,
    shoppingListId: row.shopping_list_id,
    clientId: row.client_id,
    canonicalName: row.canonical_name,
    rawLabel: row.raw_label,
    quantity: row.quantity,
    note: row.note,
    isChecked: row.is_checked === 1,
    addedByUserId: row.added_by_user_id ?? '',
    sortOrder: row.sort_order,
  };
}

function rowToShoppingListItemLocal(row: ShoppingListItemRow): ShoppingListItemLocal {
  return {
    ...rowToShoppingListItem(row),
    accountId: row.account_id,
    isDeleted: row.is_deleted === 1,
    syncStatus: row.sync_status as SyncStatus,
    syncVersion: row.sync_version,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function shoppingListItemToParams(item: ShoppingListItemLocal): (string | number | null)[] {
  return [
    item.id,
    item.accountId,
    item.shoppingListId,
    item.clientId,
    item.canonicalName ?? null,
    item.rawLabel,
    item.quantity,
    item.note ?? null,
    item.isChecked ? 1 : 0,
    item.addedByUserId ?? null,
    item.sortOrder,
    item.isDeleted ? 1 : 0,
    item.syncStatus,
    item.syncVersion,
    item.createdAt.getTime(),
    item.updatedAt.getTime(),
  ];
}

export async function upsertShoppingListItem(item: ShoppingListItemLocal): Promise<void> {
  await executeSql(
    `INSERT INTO shopping_list_items (
      id, account_id, shopping_list_id, client_id, canonical_name, raw_label,
      quantity, note, is_checked, added_by_user_id, sort_order,
      is_deleted, sync_status, sync_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      account_id = excluded.account_id,
      shopping_list_id = excluded.shopping_list_id,
      client_id = excluded.client_id,
      canonical_name = excluded.canonical_name,
      raw_label = excluded.raw_label,
      quantity = excluded.quantity,
      note = excluded.note,
      is_checked = excluded.is_checked,
      added_by_user_id = excluded.added_by_user_id,
      sort_order = excluded.sort_order,
      is_deleted = excluded.is_deleted,
      sync_status = excluded.sync_status,
      sync_version = excluded.sync_version,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at`,
    shoppingListItemToParams(item),
  );
}

export async function getItemsForList(listId: string): Promise<ShoppingListItem[]> {
  const rows = await executeSql<ShoppingListItemRow>(
    'SELECT * FROM shopping_list_items WHERE shopping_list_id = ? AND is_deleted = 0 ORDER BY sort_order, created_at',
    [listId],
  );
  return rows.map(rowToShoppingListItem);
}

export async function updateShoppingListItem(
  id: string,
  patch: Partial<ShoppingListItem>,
): Promise<void> {
  const setClauses: string[] = [];
  const params: (string | number | null)[] = [];

  if (patch.canonicalName !== undefined) {
    setClauses.push('canonical_name = ?');
    params.push(patch.canonicalName);
  }
  if (patch.rawLabel !== undefined) {
    setClauses.push('raw_label = ?');
    params.push(patch.rawLabel);
  }
  if (patch.quantity !== undefined) {
    setClauses.push('quantity = ?');
    params.push(patch.quantity);
  }
  if (patch.note !== undefined) {
    setClauses.push('note = ?');
    params.push(patch.note);
  }
  if (patch.isChecked !== undefined) {
    setClauses.push('is_checked = ?');
    params.push(patch.isChecked ? 1 : 0);
  }
  if (patch.sortOrder !== undefined) {
    setClauses.push('sort_order = ?');
    params.push(patch.sortOrder);
  }

  setClauses.push('sync_status = ?');
  params.push('pending');
  setClauses.push('updated_at = ?');
  params.push(Date.now());

  params.push(id);

  await executeSql(
    `UPDATE shopping_list_items SET ${setClauses.join(', ')} WHERE id = ?`,
    params,
  );
}

export async function softDeleteShoppingListItem(id: string): Promise<void> {
  await executeSql(
    `UPDATE shopping_list_items SET is_deleted = 1, sync_status = 'pending', updated_at = ? WHERE id = ?`,
    [Date.now(), id],
  );
}

export async function getPendingShoppingListItems(accountId: string): Promise<ShoppingListItemLocal[]> {
  const rows = await executeSql<ShoppingListItemRow>(
    `SELECT * FROM shopping_list_items WHERE account_id = ? AND sync_status = 'pending'`,
    [accountId],
  );
  return rows.map(rowToShoppingListItemLocal);
}

export async function markShoppingListItemSynced(id: string, serverId?: string): Promise<void> {
  await executeSql(
    `UPDATE shopping_list_items SET sync_status = 'synced', id = COALESCE(?, id) WHERE id = ?`,
    [serverId ?? null, id],
  );
}

// clientId -> created_at (ms epoch), for every local item row regardless of
// deleted/sync_status. Used by the pull-merge to preserve a known row's
// original createdAt instead of re-stamping it on every hydrate().
export async function getShoppingListItemCreatedAtMap(
  accountId: string,
): Promise<Map<string, number>> {
  const rows = await executeSql<{ client_id: string; created_at: number }>(
    'SELECT client_id, created_at FROM shopping_list_items WHERE account_id = ?',
    [accountId],
  );
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.client_id, row.created_at);
  return map;
}
