import { executeSql, withTransaction } from './client';
import type { ExpenseItem, SyncStatus } from '@budget/shared-types';
import { getQueuedLineItemIds, remapQueuedItemIds } from './childRepository';

interface ExpenseItemRow {
  id: string;
  local_id: string;
  expense_id: string;
  description: string;
  canonical_name: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  sort_order: number;
  is_deleted: number;
  sync_status: string;
  sync_version: number;
  created_at: number;
  updated_at: number;
  /** Child costs: line attribution (local child id). Absent on rows read before the column existed. */
  child_id?: string | null;
  /** Child costs: the line's own discount and category. Absent on rows read before the columns existed. */
  line_discount?: number | null;
  category_id?: string | null;
}

function rowToExpenseItem(row: ExpenseItemRow): ExpenseItem {
  return {
    id: row.id,
    localId: row.local_id,
    expenseId: row.expense_id,
    description: row.description,
    canonicalName: row.canonical_name ?? undefined,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    totalPrice: row.total_price,
    sortOrder: row.sort_order,
    isDeleted: row.is_deleted === 1,
    syncStatus: row.sync_status as SyncStatus,
    syncVersion: row.sync_version,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    childId: row.child_id ?? null,
    lineDiscount: row.line_discount ?? null,
    categoryId: row.category_id ?? null,
  };
}

function expenseItemToParams(item: ExpenseItem): (string | number | null)[] {
  return [
    item.id,
    item.localId,
    item.expenseId,
    item.description,
    item.canonicalName ?? null,
    item.quantity,
    item.unitPrice,
    item.totalPrice,
    item.sortOrder,
    item.isDeleted ? 1 : 0,
    item.syncStatus,
    item.syncVersion,
    item.createdAt.getTime(),
    item.updatedAt.getTime(),
    item.lineDiscount ?? null,
    item.categoryId ?? null,
    // Kept last (`child_id`, `server_known`): specs address them from the end of the list.
    item.childId ?? null,
    // Written from server data (synced) = the server has this line under this id.
    item.syncStatus === 'synced' ? 1 : 0,
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
      id, local_id, expense_id, description, canonical_name, quantity, unit_price,
      total_price, sort_order, is_deleted, sync_status, sync_version,
      created_at, updated_at, line_discount, category_id, child_id, server_known
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  if (updates.canonicalName !== undefined) {
    setClauses.push('canonical_name = ?');
    params.push(updates.canonicalName);
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

export async function upsertExpenseItem(item: ExpenseItem): Promise<void> {
  await executeSql(
    `INSERT INTO expense_items (
      id, local_id, expense_id, description, canonical_name, quantity, unit_price,
      total_price, sort_order, is_deleted, sync_status, sync_version,
      created_at, updated_at, line_discount, category_id, child_id, server_known
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      description = excluded.description,
      canonical_name = excluded.canonical_name,
      quantity = excluded.quantity,
      unit_price = excluded.unit_price,
      total_price = excluded.total_price,
      sort_order = excluded.sort_order,
      is_deleted = excluded.is_deleted,
      sync_status = excluded.sync_status,
      sync_version = excluded.sync_version,
      updated_at = excluded.updated_at,
      server_known = MAX(COALESCE(expense_items.server_known, 0), excluded.server_known),
      line_discount = excluded.line_discount,
      category_id = excluded.category_id`,
    expenseItemToParams(item),
  );
}

export async function deduplicateItemsByExpenseId(expenseId: string): Promise<void> {
  const rows = await executeSql<ExpenseItemRow>(
    'SELECT * FROM expense_items WHERE expense_id = ? AND is_deleted = 0 ORDER BY sort_order ASC, created_at ASC',
    [expenseId],
  );
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  for (const row of rows) {
    const key = `${row.description}:${row.sort_order}`;
    if (seen.has(key)) {
      duplicateIds.push(row.id);
    } else {
      seen.add(key);
    }
  }
  if (duplicateIds.length > 0) {
    for (const id of duplicateIds) {
      await executeSql(
        'UPDATE expense_items SET is_deleted = 1 WHERE id = ?',
        [id],
      );
    }
  }
}

export async function deleteItemsByExpenseId(expenseId: string): Promise<void> {
  await executeSql(
    'UPDATE expense_items SET is_deleted = 1, sync_status = ? WHERE expense_id = ?',
    ['pending', expenseId],
  );
}

/**
 * Replaces an expense's line items with an authoritative set from the server.
 *
 * A receipt scanned on this device writes its lines locally under
 * client-generated ids with `syncStatus: 'pending'`. The server then creates
 * its OWN rows with real ids, and those ids are the only ones
 * `receipt-split.service.ts` will accept in `itemIds` — a local id is rejected
 * with "Item <id> does not belong to this expense". So the local rows have to
 * be replaced, not merged alongside: `deduplicateItemsByExpenseId` keys on
 * `description:sort_order` and keeps the row created FIRST, which is the local
 * pending one — exactly the wrong winner.
 *
 * The delete is hard rather than soft on purpose. These rows are being replaced
 * by their own server counterparts, not removed by a user, so a tombstone would
 * carry no information and would keep turning up in dedup scans.
 */
export async function replaceItemsForExpense(expenseId: string, items: ExpenseItem[]): Promise<void> {
  await withTransaction(async () => {
    // Child costs: line attribution survives the replace.
    // - Each incoming row is matched to a local one by id, else by position
    //   (`sort_order`, the key the adopted rows are built with; an ambiguous
    //   position matches nothing).
    // - A matched line with a QUEUED child change keeps its local child: that
    //   intent has not reached the server, so the server's value is stale.
    // - Otherwise the incoming `childId` wins (the server's, already mapped to a
    //   local child id). `undefined` means the caller could not tell (a create
    //   response carries no child, or the child is unknown here) and keeps the
    //   local value.
    // Queued line changes follow their line to its server id.
    const [previous, queuedLines] = await Promise.all([
      executeSql<{ id: string; sort_order: number; child_id: string | null }>(
        'SELECT id, sort_order, child_id FROM expense_items WHERE expense_id = ? AND is_deleted = 0',
        [expenseId],
      ),
      getQueuedLineItemIds(expenseId),
    ]);
    const byId = new Map(previous.map((row) => [row.id, row]));
    const byPosition = new Map<number, { id: string; child_id: string | null } | null>();
    for (const row of previous) {
      byPosition.set(row.sort_order, byPosition.has(row.sort_order) ? null : row);
    }
    const idMap = new Map<string, string>();
    const carried = items.map((item) => {
      const old = byId.get(item.id) ?? byPosition.get(item.sortOrder) ?? null;
      if (old && old.id !== item.id) idMap.set(old.id, item.id);
      let childId: string | null;
      if (old && queuedLines.has(old.id)) childId = old.child_id ?? null;
      else if (item.childId !== undefined) childId = item.childId;
      else childId = old?.child_id ?? null;
      return { ...item, childId };
    });

    await executeSql('DELETE FROM expense_items WHERE expense_id = ?', [expenseId]);
    for (const item of carried) {
      await insertExpenseItem(item);
    }
    await remapQueuedItemIds(expenseId, idMap);
  });
}

/**
 * A hand-added line's push succeeded and the server knows it as `serverId`.
 * Re-key the local row to that id (its child kept) and mark it server-known,
 * and point queued child changes at it — so a line attribution made on it is
 * delivered by the next drain, not held until a cold-start backfill. If a row
 * under `serverId` already exists (a refetch got there first), that row is the
 * server's and the local duplicate goes.
 */
export async function adoptServerItemId(expenseId: string, localId: string, serverId: string): Promise<void> {
  await withTransaction(async () => {
    if (serverId !== localId) {
      const clash = await executeSql<{ id: string }>('SELECT id FROM expense_items WHERE id = ?', [serverId]);
      if (clash.length > 0) {
        await executeSql('DELETE FROM expense_items WHERE id = ?', [localId]);
        await remapQueuedItemIds(expenseId, new Map([[localId, serverId]]));
        return;
      }
    }
    await executeSql(
      "UPDATE expense_items SET id = ?, local_id = ?, server_known = 1, sync_status = 'synced' WHERE id = ?",
      [serverId, serverId, localId],
    );
    if (serverId !== localId) await remapQueuedItemIds(expenseId, new Map([[localId, serverId]]));
  });
}

// ─── Child costs: line attribution ───────────────────────────────────────────
//
// `child_id` is deliberately NOT in `upsertExpenseItem`'s ON CONFLICT update
// list: a pull re-upserting a line must not wipe an attribution made on this
// device. The pull applies the server's value through `setExpenseItemChild`
// (childSync.ts), and only for expenses with nothing queued.

export async function setExpenseItemChild(itemId: string, childId: string | null): Promise<void> {
  await executeSql('UPDATE expense_items SET child_id = ? WHERE id = ?', [childId, itemId]);
}

/** Clear every line's child on one expense; returns the ids of the lines that had one. */
export async function clearExpenseItemChildren(expenseId: string): Promise<string[]> {
  const rows = await executeSql<{ id: string }>(
    'SELECT id FROM expense_items WHERE expense_id = ? AND is_deleted = 0 AND child_id IS NOT NULL',
    [expenseId],
  );
  if (rows.length === 0) return [];
  await executeSql(
    'UPDATE expense_items SET child_id = NULL WHERE expense_id = ? AND child_id IS NOT NULL',
    [expenseId],
  );
  return rows.map((r) => r.id);
}

/** Live attributed lines of the account's live expenses. */
export async function getAttributedItems(accountId: string): Promise<ExpenseItem[]> {
  const rows = await executeSql<ExpenseItemRow>(
    `SELECT ei.* FROM expense_items ei
     JOIN expenses e ON e.id = ei.expense_id
     WHERE e.account_id = ? AND e.is_deleted = 0 AND ei.is_deleted = 0 AND ei.child_id IS NOT NULL`,
    [accountId],
  );
  return rows.map(rowToExpenseItem);
}

/**
 * Every live line of each live expense that has at least one attributed line.
 * The child costs screen needs the whole basket, not just the attributed
 * lines: a receipt discount is folded over all of an expense's lines
 * (`childAmounts`), so reading only the attributed ones would hand them the
 * whole discount.
 */
export async function getChildLineItems(accountId: string): Promise<ExpenseItem[]> {
  const rows = await executeSql<ExpenseItemRow>(
    `SELECT ei.* FROM expense_items ei
     JOIN expenses e ON e.id = ei.expense_id
     WHERE e.account_id = ? AND e.is_deleted = 0 AND ei.is_deleted = 0
       AND ei.expense_id IN (
         SELECT expense_id FROM expense_items WHERE is_deleted = 0 AND child_id IS NOT NULL
       )`,
    [accountId],
  );
  return rows.map(rowToExpenseItem);
}

/**
 * Child costs: set each line's discount and category to the server's values,
 * writing only rows that differ. Identity, sync status, `server_known` and the
 * line's child are left alone.
 */
export async function setExpenseItemDetails(
  items: { id: string; lineDiscount: number | null; categoryId: string | null }[],
): Promise<void> {
  for (const item of items) {
    await executeSql(
      `UPDATE expense_items SET line_discount = ?, category_id = ?
       WHERE id = ? AND (line_discount IS NOT ? OR category_id IS NOT ?)`,
      [item.lineDiscount, item.categoryId, item.id, item.lineDiscount, item.categoryId],
    );
  }
}
