import { executeSql } from './client';
import type { Category } from '@budget/shared-types';

interface CategoryRow {
  id: string;
  user_id: string | null;
  account_id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  type: string;
  is_system: number;
  parent_id: string | null;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  sync_version: number;
}

function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    accountId: row.account_id ?? undefined,
    name: row.name,
    icon: row.icon ?? undefined,
    color: row.color ?? undefined,
    type: row.type as 'expense' | 'income',
    isSystem: row.is_system === 1,
    parentId: row.parent_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    isDeleted: row.is_deleted === 1,
    syncVersion: row.sync_version,
  };
}

function categoryToParams(category: Category): (string | number | null)[] {
  return [
    category.id,
    category.userId ?? null,
    category.accountId ?? null,
    category.name,
    category.icon ?? null,
    category.color ?? null,
    category.type,
    category.isSystem ? 1 : 0,
    category.parentId ?? null,
    category.createdAt.getTime(),
    category.updatedAt.getTime(),
    category.isDeleted ? 1 : 0,
    category.syncVersion,
  ];
}

export async function insertCategory(category: Category): Promise<void> {
  await executeSql(
    `INSERT INTO categories (
      id, user_id, account_id, name, icon, color, type, is_system, parent_id,
      created_at, updated_at, is_deleted, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    categoryToParams(category),
  );
}

export async function upsertCategory(category: Category): Promise<void> {
  await executeSql(
    `INSERT INTO categories (
      id, user_id, account_id, name, icon, color, type, is_system, parent_id,
      created_at, updated_at, is_deleted, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      account_id = excluded.account_id,
      name = excluded.name,
      icon = excluded.icon,
      color = excluded.color,
      type = excluded.type,
      is_system = excluded.is_system,
      parent_id = excluded.parent_id,
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
