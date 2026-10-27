import { executeSql } from './client';
import type { Category } from '@budget/shared-types';

interface CategoryRow {
  id: string;
  client_id: string | null;
  user_id: string | null;
  account_id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  type: string;
  is_system: number;
  parent_id: string | null;
  system_key?: string | null;
  name_customized?: number | null;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  sync_version: number;
}

function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    clientId: row.client_id ?? undefined,
    userId: row.user_id ?? undefined,
    accountId: row.account_id ?? undefined,
    name: row.name,
    icon: row.icon ?? undefined,
    color: row.color ?? undefined,
    type: row.type as 'expense' | 'income',
    isSystem: row.is_system === 1,
    parentId: row.parent_id ?? undefined,
    systemKey: row.system_key ?? null,
    nameCustomized: row.name_customized === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    isDeleted: row.is_deleted === 1,
    syncVersion: row.sync_version,
  };
}

function categoryToParams(category: Category): (string | number | null)[] {
  return [
    category.id,
    category.clientId ?? null,
    category.userId ?? null,
    category.accountId ?? null,
    category.name,
    category.icon ?? null,
    category.color ?? null,
    category.type,
    category.isSystem ? 1 : 0,
    category.parentId ?? null,
    category.systemKey ?? null,
    category.nameCustomized ? 1 : 0,
    category.createdAt.getTime(),
    category.updatedAt.getTime(),
    category.isDeleted ? 1 : 0,
    category.syncVersion,
  ];
}

export async function insertCategory(category: Category): Promise<void> {
  await executeSql(
    `INSERT INTO categories (
      id, client_id, user_id, account_id, name, icon, color, type, is_system, parent_id,
      system_key, name_customized, created_at, updated_at, is_deleted, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    categoryToParams(category),
  );
}

/**
 * Insert or update a category row.
 *
 * `systemKey`/`nameCustomized` are only overwritten when the incoming object
 * CARRIES `systemKey` (a string or an explicit `null`): several pull paths
 * upsert a category embedded in an expense/income, and a caller that never
 * heard of the field must not silently strip a key the row already has - an
 * absent field never clears a key. An explicit `null` (the server cleared it,
 * e.g. on a type change) does.
 */
export async function upsertCategory(category: Category): Promise<void> {
  const keyed = category.systemKey !== undefined;
  await executeSql(
    `INSERT INTO categories (
      id, client_id, user_id, account_id, name, icon, color, type, is_system, parent_id,
      system_key, name_customized, created_at, updated_at, is_deleted, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      client_id = excluded.client_id,
      user_id = excluded.user_id,
      account_id = excluded.account_id,
      name = excluded.name,
      icon = excluded.icon,
      color = excluded.color,
      type = excluded.type,
      is_system = excluded.is_system,
      parent_id = excluded.parent_id,${
        keyed
          ? `
      system_key = excluded.system_key,
      name_customized = excluded.name_customized,`
          : ''
      }
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      is_deleted = excluded.is_deleted,
      sync_version = excluded.sync_version`,
    categoryToParams(category),
  );
}

export async function getAllCategories(accountId: string): Promise<Category[]> {
  const rows = await executeSql<CategoryRow>(
    'SELECT * FROM categories WHERE account_id = ? AND is_deleted = 0 ORDER BY name ASC',
    [accountId],
  );
  return rows.map(rowToCategory);
}

export async function getCategoryById(id: string): Promise<Category | null> {
  const rows = await executeSql<CategoryRow>(
    'SELECT * FROM categories WHERE id = ?',
    [id],
  );
  return rows.length > 0 ? rowToCategory(rows[0]) : null;
}

export async function getCategoryByName(
  accountId: string,
  name: string,
  type: 'expense' | 'income',
): Promise<Category | null> {
  const rows = await executeSql<CategoryRow>(
    'SELECT * FROM categories WHERE account_id = ? AND name = ? AND type = ? AND is_deleted = 0',
    [accountId, name, type],
  );
  return rows.length > 0 ? rowToCategory(rows[0]) : null;
}

/**
 * The account's category with this name+type that is NOT the given id.
 *
 * Used to spot the stale local twin of a server category: both sides hold the
 * same name and type, and that is the only thing linking them once `clientId`
 * is absent on both (ABA-566).
 */
export async function getCategoryByNameExcludingId(
  accountId: string,
  name: string,
  type: 'expense' | 'income',
  excludeId: string,
): Promise<Category | null> {
  const rows = await executeSql<CategoryRow>(
    'SELECT * FROM categories WHERE account_id = ? AND name = ? AND type = ? AND id != ? AND is_deleted = 0',
    [accountId, name, type, excludeId],
  );
  return rows.length > 0 ? rowToCategory(rows[0]) : null;
}

/**
 * Live local rows of this type, other than `excludeId`, that a pulled keyed
 * server row may absorb: rows already carrying `systemKey`, plus this
 * device's own seeds (`default-*`) that have no key yet. The second half is
 * what lets the FIRST pull after an upgrade converge: it runs before
 * `loadCategories` labels old seed rows, so they are still keyless then. The
 * caller decides which candidates really stand for the key (by stored name).
 */
export async function getKeyConvergenceCandidates(
  accountId: string,
  systemKey: string,
  type: 'expense' | 'income',
  excludeId: string,
): Promise<Category[]> {
  const rows = await executeSql<CategoryRow>(
    "SELECT * FROM categories WHERE account_id = ? AND type = ? AND id != ? AND is_deleted = 0 AND (system_key = ? OR (system_key IS NULL AND id LIKE 'default-%'))",
    [accountId, type, excludeId, systemKey],
  );
  return rows.map(rowToCategory);
}

/**
 * Fold a stale duplicate category into the row the server owns.
 *
 * A category created before `clientId` support carries a device-generated id
 * here and a different primary key on the server, with nothing linking the two.
 * A pull therefore inserted the server's row ALONGSIDE the local one, and every
 * expense kept pointing at the local id — an id the server cannot resolve, so
 * the categorisation never arrived and the server stored no category at all
 * (ABA-566).
 *
 * Deletes rather than renames: the surviving row has already been written by
 * the pull, so renaming the stale one onto its id would collide on the primary
 * key. A seed row (`default-*`) is SOFT-deleted instead: its id is the
 * tombstone `loadCategories` checks (`categoryExistsById`) before seeding, and
 * without it a later deletion of the server's row would bring the seed back.
 * The tombstone is invisible - every list read filters `is_deleted = 0`, and
 * categories have no push queue, so it never syncs. Re-pointed transactions are marked `pending` because their stored
 * category is, by definition, not what the server has — without that nothing
 * would ever push the correction and the rows would stay uncategorised on the
 * server forever.
 */
export async function mergeCategoryInto(staleId: string, survivingId: string): Promise<void> {
  if (!staleId || !survivingId || staleId === survivingId) return;

  await executeSql(
    "UPDATE expenses SET category_id = ?, sync_status = 'pending' WHERE category_id = ?",
    [survivingId, staleId],
  );
  await executeSql(
    "UPDATE incomes SET category_id = ?, sync_status = 'pending' WHERE category_id = ?",
    [survivingId, staleId],
  );
  await executeSql('UPDATE budget_categories SET category_id = ? WHERE category_id = ?', [
    survivingId,
    staleId,
  ]);
  await executeSql('UPDATE expense_category_splits SET category_id = ? WHERE category_id = ?', [
    survivingId,
    staleId,
  ]);
  if (staleId.startsWith('default-')) {
    await executeSql('UPDATE categories SET is_deleted = 1, updated_at = ? WHERE id = ?', [Date.now(), staleId]);
  } else {
    await executeSql('DELETE FROM categories WHERE id = ?', [staleId]);
  }
}

export interface CategoryReferenceCounts {
  expenses: number;
  incomes: number;
  budgetCategories: number;
  splits: number;
  children: number;
}

/**
 * What still points at this category on THIS device.
 *
 * Mirrors the five checks the server runs before allowing a category to be
 * deleted. It exists because the server's guard can only protect a category the
 * server can find: for a row it cannot resolve it answers 404, and the client
 * used to swallow that and delete locally with no check at all (ABA-567).
 * Counting locally also makes the guard work offline and for a category that
 * only ever existed on this device, which the server could never vouch for.
 *
 * On web every read resolves to `[]`, so all five come back 0 and the guard
 * defers to the server - which is correct there, since a web client only ever
 * holds ids the server issued.
 */
export async function countCategoryReferences(categoryId: string): Promise<CategoryReferenceCounts> {
  const count = async (sql: string): Promise<number> => {
    const rows = await executeSql<{ cnt: number }>(sql, [categoryId]);
    return rows.length > 0 ? Number(rows[0].cnt) || 0 : 0;
  };

  const [expenses, incomes, budgetCategories, splits, children] = await Promise.all([
    count('SELECT COUNT(*) as cnt FROM expenses WHERE category_id = ? AND is_deleted = 0'),
    count('SELECT COUNT(*) as cnt FROM incomes WHERE category_id = ? AND is_deleted = 0'),
    count('SELECT COUNT(*) as cnt FROM budget_categories WHERE category_id = ? AND is_deleted = 0'),
    count('SELECT COUNT(*) as cnt FROM expense_category_splits WHERE category_id = ? AND is_deleted = 0'),
    count('SELECT COUNT(*) as cnt FROM categories WHERE parent_id = ? AND is_deleted = 0'),
  ]);

  return { expenses, incomes, budgetCategories, splits, children };
}

export async function deleteCategory(id: string): Promise<void> {
  await executeSql(
    'UPDATE categories SET is_deleted = 1, updated_at = ? WHERE id = ?',
    [Date.now(), id],
  );
}

export async function categoryExistsById(id: string): Promise<boolean> {
  const rows = await executeSql<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM categories WHERE id = ?',
    [id],
  );
  return rows.length > 0 && rows[0].cnt > 0;
}

export async function getCategoryByClientId(
  accountId: string,
  clientId: string,
): Promise<Category | null> {
  const rows = await executeSql<CategoryRow>(
    'SELECT * FROM categories WHERE account_id = ? AND client_id = ?',
    [accountId, clientId],
  );
  return rows.length > 0 ? rowToCategory(rows[0]) : null;
}

/**
 * Adopt the server PK for a category that was created locally (offline-first).
 *
 * The row was saved under its device-generated id, so every reference
 * (`expenses.category_id`, `incomes.category_id`, `budget_categories.category_id`,
 * `expense_category_splits.category_id`) points at that local id. The server
 * row has its own PK — and the server resolves a budget's allocation by NAME to
 * that PK — so leaving the local id in place makes the app and the server
 * disagree about which category an expense belongs to: a budget on the new
 * category then reports 0,00 after the next pull, while the list still shows
 * the category. Re-point everything at the server id in one pass.
 *
 * `clientId` is kept on the row so an idempotent resend of the create (and the
 * pull, which matches by clientId) still finds this row.
 */
export async function remapCategoryId(
  oldId: string,
  newId: string,
  clientId: string,
): Promise<void> {
  if (oldId === newId) return;

  await executeSql(
    'UPDATE categories SET id = ?, client_id = ? WHERE id = ?',
    [newId, clientId, oldId],
  );
  await executeSql('UPDATE expenses SET category_id = ? WHERE category_id = ?', [newId, oldId]);
  await executeSql('UPDATE incomes SET category_id = ? WHERE category_id = ?', [newId, oldId]);
  await executeSql('UPDATE categories SET parent_id = ? WHERE parent_id = ?', [newId, oldId]);
  await executeSql('UPDATE budget_categories SET category_id = ? WHERE category_id = ?', [newId, oldId]);
  await executeSql('UPDATE expense_category_splits SET category_id = ? WHERE category_id = ?', [newId, oldId]);
}
