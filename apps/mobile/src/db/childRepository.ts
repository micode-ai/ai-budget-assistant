import { executeSql } from './client';
import type { Child, ExpenseChildLink } from '@budget/shared-types';

/**
 * Child costs on the device: children, whole-expense links and the child-cost
 * slice of the sync queue.
 *
 * Ids: a child's local `id` is the clientId the server learns on create, and
 * stays its id for good; `server_id` holds the server PK once known (a push
 * ack or a pull). Links store LOCAL expense and child ids, so everything on the
 * device joins without translation.
 *
 * Child names are personal data of minors: nothing here logs a name.
 */

interface ChildRow {
  id: string;
  server_id: string | null;
  account_id: string;
  name: string;
  color: string | null;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  sync_status: string;
  sync_version: number;
}

/** A local child row as the store writes it. */
export interface LocalChildRecord {
  id: string;
  serverId: string | null;
  accountId: string;
  name: string;
  color?: string;
  /** ISO string, or null when active. */
  archivedAt: string | null;
  isDeleted: boolean;
  syncStatus: 'pending' | 'synced';
  /** epoch ms */
  updatedAt: number;
}

function rowToChild(row: ChildRow): Child {
  return {
    id: row.id,
    accountId: row.account_id,
    clientId: row.id,
    name: row.name,
    color: row.color ?? undefined,
    archivedAt: row.archived_at != null ? new Date(row.archived_at).toISOString() : null,
  };
}

function rowToRecord(row: ChildRow): LocalChildRecord {
  return {
    id: row.id,
    serverId: row.server_id,
    accountId: row.account_id,
    name: row.name,
    color: row.color ?? undefined,
    archivedAt: row.archived_at != null ? new Date(row.archived_at).toISOString() : null,
    isDeleted: row.is_deleted === 1,
    syncStatus: row.sync_status === 'synced' ? 'synced' : 'pending',
    updatedAt: row.updated_at,
  };
}

export async function getChildren(accountId: string, includeArchived: boolean): Promise<Child[]> {
  const rows = await executeSql<ChildRow>(
    `SELECT * FROM children WHERE account_id = ? AND is_deleted = 0${
      includeArchived ? '' : ' AND archived_at IS NULL'
    } ORDER BY created_at ASC`,
    [accountId],
  );
  return rows.map(rowToChild);
}

/** Every non-deleted row of the account with its sync bookkeeping (pull merge). */
export async function getChildRecords(accountId: string): Promise<LocalChildRecord[]> {
  const rows = await executeSql<ChildRow>(
    'SELECT * FROM children WHERE account_id = ? AND is_deleted = 0',
    [accountId],
  );
  return rows.map(rowToRecord);
}

export async function upsertChild(child: LocalChildRecord): Promise<void> {
  const archivedAt = child.archivedAt ? new Date(child.archivedAt).getTime() : null;
  await executeSql(
    `INSERT INTO children (
      id, server_id, account_id, name, color, archived_at,
      created_at, updated_at, is_deleted, sync_status, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      server_id = COALESCE(excluded.server_id, children.server_id),
      name = excluded.name,
      color = excluded.color,
      archived_at = excluded.archived_at,
      updated_at = excluded.updated_at,
      is_deleted = excluded.is_deleted,
      sync_status = excluded.sync_status`,
    [
      child.id,
      child.serverId,
      child.accountId,
      child.name,
      child.color ?? null,
      archivedAt,
      child.updatedAt,
      child.updatedAt,
      child.isDeleted ? 1 : 0,
      child.syncStatus,
      0,
    ],
  );
}

/** A push ack: remember the server PK and mark the row synced. */
export async function markChildSynced(id: string, serverId: string | undefined): Promise<void> {
  await executeSql(
    "UPDATE children SET sync_status = 'synced', server_id = COALESCE(?, server_id) WHERE id = ?",
    [serverId ?? null, id],
  );
}

/** The server no longer returns this child (it was removed with its account data). */
export async function softDeleteChildLocally(id: string): Promise<void> {
  await executeSql('UPDATE children SET is_deleted = 1, updated_at = ? WHERE id = ?', [Date.now(), id]);
}

/**
 * Server PK -> local id for the account. Each local id also maps to itself, so
 * an id that is already local (or a server PK adopted as the local id) resolves.
 */
export async function getChildServerIdMap(accountId: string): Promise<Map<string, string>> {
  const rows = await executeSql<{ id: string; server_id: string | null }>(
    'SELECT id, server_id FROM children WHERE account_id = ? AND is_deleted = 0',
    [accountId],
  );
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.id, r.id);
    if (r.server_id) map.set(r.server_id, r.id);
  }
  return map;
}

/** Local id -> server PK for the account's live children whose server id is known. */
export async function getChildServerIds(accountId: string): Promise<Map<string, string>> {
  const rows = await executeSql<{ id: string; server_id: string | null }>(
    'SELECT id, server_id FROM children WHERE account_id = ? AND is_deleted = 0 AND server_id IS NOT NULL',
    [accountId],
  );
  const map = new Map<string, string>();
  for (const r of rows) if (r.server_id) map.set(r.id, r.server_id);
  return map;
}

// ─── Server presence (queue drain) ───────────────────────────────────────────

/**
 * Local expenses of the account that have not reached the server: no server PK
 * recorded and not synced. Their link/line changes wait without counting an
 * attempt — the server answers "not found" until the expense lands.
 */
export async function getUnsyncedExpenseIds(accountId: string): Promise<Set<string>> {
  const rows = await executeSql<{ id: string }>(
    "SELECT id FROM expenses WHERE account_id = ? AND is_deleted = 0 AND server_id IS NULL AND sync_status != 'synced'",
    [accountId],
  );
  return new Set(rows.map((r) => r.id));
}

/**
 * Of the given line ids, those the server does not know under that id yet (a
 * scanned or hand-added line still under its client id). Decided by identity —
 * `server_known`, set whenever the row was written from server data — never by
 * `sync_status`: an edited server line stays `pending` until the next refetch
 * and must not hold back its expense's child changes.
 */
export async function getUnsyncedItemIds(itemIds: string[]): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();
  const rows = await executeSql<{ id: string }>(
    `SELECT id FROM expense_items WHERE COALESCE(server_known, 0) = 0 AND id IN (${itemIds.map(() => '?').join(', ')})`,
    itemIds,
  );
  return new Set(rows.map((r) => r.id));
}

/** Ids of an expense's lines with a queued child change. */
export async function getQueuedLineItemIds(expenseId: string): Promise<Set<string>> {
  const rows = await executeSql<{ payload: string }>(
    "SELECT payload FROM sync_queue WHERE entity_type = 'expense_item_child'",
    [],
  );
  const ids = new Set<string>();
  for (const r of rows) {
    const p = parsePayload(r.payload);
    if (p.expenseId === expenseId && typeof p.itemId === 'string') ids.add(p.itemId);
  }
  return ids;
}

/**
 * A receipt's lines were replaced by the server's rows (new ids): point queued
 * line changes at the new ids instead of letting them 404 and be dropped.
 */
export async function remapQueuedItemIds(expenseId: string, idMap: Map<string, string>): Promise<void> {
  if (idMap.size === 0) return;
  const queued = await executeSql<{ id: string; entity_id: string; payload: string }>(
    "SELECT id, entity_id, payload FROM sync_queue WHERE entity_type = 'expense_item_child'",
    [],
  );
  for (const q of queued) {
    const payload = parsePayload(q.payload);
    const newId = idMap.get(String(payload.itemId));
    if (payload.expenseId !== expenseId || !newId) continue;
    payload.itemId = newId;
    await executeSql('UPDATE sync_queue SET entity_id = ?, payload = ? WHERE id = ?', [
      newId,
      JSON.stringify(payload),
      q.id,
    ]);
  }
}

/**
 * Sign-out / sign-in on a shared device: child names are minors' data, so the
 * children, their links and the queued child-cost changes go with the
 * previous user's expenses.
 */
export async function clearAllChildData(): Promise<void> {
  await executeSql('DELETE FROM expense_children', []);
  await executeSql('DELETE FROM children', []);
  await executeSql(`DELETE FROM sync_queue WHERE entity_type IN ${QUEUE_TYPES_SQL}`, []);
}

// ─── Whole-expense links ─────────────────────────────────────────────────────

interface LinkRow {
  expense_id: string;
  child_id: string;
  share: number;
}

const rowToLink = (r: LinkRow): ExpenseChildLink => ({
  expenseId: r.expense_id,
  childId: r.child_id,
  share: Number(r.share),
});

/** Live links of the account's live expenses. */
export async function getExpenseChildLinks(accountId: string): Promise<ExpenseChildLink[]> {
  const rows = await executeSql<LinkRow>(
    `SELECT ec.expense_id, ec.child_id, ec.share FROM expense_children ec
     JOIN expenses e ON e.id = ec.expense_id
     WHERE e.account_id = ? AND e.is_deleted = 0 AND ec.is_deleted = 0`,
    [accountId],
  );
  return rows.map(rowToLink);
}

export async function getLinksForExpense(expenseId: string): Promise<ExpenseChildLink[]> {
  const rows = await executeSql<LinkRow>(
    'SELECT expense_id, child_id, share FROM expense_children WHERE expense_id = ? AND is_deleted = 0',
    [expenseId],
  );
  return rows.map(rowToLink);
}

/**
 * Replace an expense's whole-expense links with `links` (local child ids): the
 * live ones are soft-deleted, then each given link is upserted back to life.
 * An empty list only removes. The caller wraps this in a transaction.
 */
export async function replaceExpenseChildLinks(
  expenseId: string,
  links: { childId: string; share: number }[],
): Promise<void> {
  const now = Date.now();
  await executeSql(
    'UPDATE expense_children SET is_deleted = 1, updated_at = ? WHERE expense_id = ? AND is_deleted = 0',
    [now, expenseId],
  );
  for (const link of links) {
    await executeSql(
      `INSERT INTO expense_children (
        id, expense_id, child_id, share, created_at, updated_at, is_deleted, sync_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(expense_id, child_id) DO UPDATE SET share = excluded.share, is_deleted = 0, updated_at = excluded.updated_at`,
      [`${expenseId}:${link.childId}`, expenseId, link.childId, link.share, now, now, 0, 0],
    );
  }
}

// ─── Sync queue (child costs only) ───────────────────────────────────────────

/**
 * Child costs is the first user of the long-declared `sync_queue` table, read
 * only for these entity types. `expense_item_child` is the device's own name
 * for "set one line's child" — it is replayed through the REST route, not as a
 * `/sync/push` `expense_item` change (see childSync.ts).
 */
export type ChildQueueEntityType = 'child' | 'expense_child' | 'expense_item_child';
const QUEUE_TYPES_SQL = "('child', 'expense_child', 'expense_item_child')";

export interface NewQueuedChildChange {
  entityType: ChildQueueEntityType;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  accountId: string;
}

export interface StoredQueuedChildChange extends NewQueuedChildChange {
  id: string;
  attempts: number;
  /**
   * epoch ms when a line change was first found undeliverable (its expense is
   * on the server, the line is not); null/absent otherwise. See childSync.ts.
   */
  undeliverableSince?: number | null;
}

/** `last_error` marker of a line change whose line the server does not know. */
export const UNDELIVERABLE_LINE_ERROR = 'line not on server';

interface QueueRow {
  id: string;
  entity_type: string;
  entity_id: string;
  operation: string;
  payload: string;
  account_id: string;
  attempts: number | null;
  last_error?: string | null;
  last_attempt_at?: number | null;
}

let queueSeq = 0;
function queueId(): string {
  queueSeq = (queueSeq + 1) % 1_000_000;
  return `cq-${Date.now().toString(36)}-${queueSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function enqueueChildChange(change: NewQueuedChildChange): Promise<void> {
  await executeSql(
    `INSERT INTO sync_queue (
      id, entity_type, entity_id, operation, payload, account_id, created_at, attempts
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      queueId(),
      change.entityType,
      change.entityId,
      change.operation,
      JSON.stringify(change.payload),
      change.accountId,
      Date.now(),
      0,
    ],
  );
}

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The account's queued child-cost changes in the order they were made. */
export async function getQueuedChildChanges(accountId: string): Promise<StoredQueuedChildChange[]> {
  const rows = await executeSql<QueueRow>(
    `SELECT id, entity_type, entity_id, operation, payload, account_id, attempts, last_error, last_attempt_at FROM sync_queue
     WHERE account_id = ? AND entity_type IN ${QUEUE_TYPES_SQL}
     ORDER BY created_at ASC, rowid ASC`,
    [accountId],
  );
  return rows.map((r) => ({
    id: r.id,
    entityType: r.entity_type as ChildQueueEntityType,
    entityId: r.entity_id,
    operation: r.operation as NewQueuedChildChange['operation'],
    payload: parsePayload(r.payload),
    accountId: r.account_id,
    attempts: r.attempts ?? 0,
    undeliverableSince:
      r.last_error === UNDELIVERABLE_LINE_ERROR && r.last_attempt_at != null ? r.last_attempt_at : null,
  }));
}

/**
 * Local ids of expenses with a queued link or line change. A pull must not
 * overwrite their attribution with the server's older copy.
 */
export async function getPendingAttributionExpenseIds(accountId: string): Promise<Set<string>> {
  const rows = await executeSql<{ entity_type: string; payload: string }>(
    `SELECT entity_type, payload FROM sync_queue
     WHERE account_id = ? AND entity_type IN ('expense_child', 'expense_item_child')`,
    [accountId],
  );
  const ids = new Set<string>();
  for (const r of rows) {
    const expenseId = parsePayload(r.payload).expenseId;
    if (typeof expenseId === 'string') ids.add(expenseId);
  }
  return ids;
}

export async function deleteQueuedChildChanges(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await executeSql(`DELETE FROM sync_queue WHERE id IN (${ids.map(() => '?').join(', ')})`, ids);
}

export async function recordChildQueueFailure(ids: string[], error: string): Promise<void> {
  if (ids.length === 0) return;
  await executeSql(
    `UPDATE sync_queue SET attempts = attempts + 1, last_error = ?, last_attempt_at = ?
     WHERE id IN (${ids.map(() => '?').join(', ')})`,
    [error, Date.now(), ...ids],
  );
}

/**
 * Stamp line changes as undeliverable. The first stamp is kept (COALESCE) so
 * the age counts from when the line was first found missing; a row whose
 * last error was something else starts its clock now. No attempt is counted.
 */
export async function markLinesUndeliverable(ids: string[], now: number): Promise<void> {
  if (ids.length === 0) return;
  await executeSql(
    `UPDATE sync_queue SET
       last_attempt_at = CASE WHEN last_error = ? THEN COALESCE(last_attempt_at, ?) ELSE ? END,
       last_error = ?
     WHERE id IN (${ids.map(() => '?').join(', ')})`,
    [UNDELIVERABLE_LINE_ERROR, now, now, UNDELIVERABLE_LINE_ERROR, ...ids],
  );
}
