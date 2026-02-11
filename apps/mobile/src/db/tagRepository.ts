import { executeSql } from './client';
import type { Tag, SyncStatus } from '@budget/shared-types';

interface TagRow {
  id: string;
  account_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  usage_count: number;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  sync_status: string;
  sync_version: number;
}

interface ExpenseTagRow {
  id: string;
  expense_id: string;
  tag_id: string;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  sync_version: number;
}

function rowToTag(row: TagRow): Tag {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    color: row.color ?? undefined,
    icon: row.icon ?? undefined,
    usageCount: row.usage_count,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    isDeleted: row.is_deleted === 1,
    syncStatus: row.sync_status as SyncStatus,
    syncVersion: row.sync_version,
  };
}

function tagToParams(tag: Tag): (string | number | null)[] {
  return [
    tag.id,
    tag.accountId,
    tag.name,
    tag.color ?? null,
    tag.icon ?? null,
    tag.usageCount,
    tag.createdAt.getTime(),
    tag.updatedAt.getTime(),
    tag.isDeleted ? 1 : 0,
    tag.syncStatus,
    tag.syncVersion,
  ];
}

export async function insertTag(tag: Tag): Promise<void> {
  await executeSql(
    `INSERT INTO tags (
      id, account_id, name, color, icon, usage_count,
      created_at, updated_at, is_deleted, sync_status, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    tagToParams(tag),
  );
}

export async function upsertTag(tag: Tag): Promise<void> {
  // Remove conflicting tag with same (account_id, name) but different id (local vs server)
  await executeSql(
    `DELETE FROM tags WHERE account_id = ? AND name = ? AND id != ?`,
    [tag.accountId, tag.name, tag.id],
  );
  await executeSql(
    `INSERT INTO tags (
      id, account_id, name, color, icon, usage_count,
      created_at, updated_at, is_deleted, sync_status, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      account_id = excluded.account_id,
      name = excluded.name,
      color = excluded.color,
      icon = excluded.icon,
      usage_count = excluded.usage_count,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      is_deleted = excluded.is_deleted,
      sync_status = excluded.sync_status,
      sync_version = excluded.sync_version`,
    tagToParams(tag),
  );
}

export async function getAllTags(accountId: string): Promise<Tag[]> {
  const rows = await executeSql<TagRow>(
    'SELECT * FROM tags WHERE account_id = ? AND is_deleted = 0 ORDER BY usage_count DESC',
    [accountId],
  );
  return rows.map(rowToTag);
}

export async function getTagById(id: string): Promise<Tag | null> {
  const rows = await executeSql<TagRow>(
    'SELECT * FROM tags WHERE id = ?',
    [id],
  );
  return rows.length > 0 ? rowToTag(rows[0]) : null;
}

export async function deleteTag(id: string): Promise<void> {
  await executeSql(
    'UPDATE tags SET is_deleted = 1, updated_at = ? WHERE id = ?',
    [Date.now(), id],
  );
}

export async function insertExpenseTag(expenseTag: {
  id: string;
  expenseId: string;
  tagId: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted?: boolean;
  syncVersion?: number;
}): Promise<void> {
  await executeSql(
    `INSERT INTO expense_tags (
      id, expense_id, tag_id, created_at, updated_at, is_deleted, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      expenseTag.id,
      expenseTag.expenseId,
      expenseTag.tagId,
      expenseTag.createdAt.getTime(),
      expenseTag.updatedAt.getTime(),
      expenseTag.isDeleted ? 1 : 0,
      expenseTag.syncVersion ?? 0,
    ],
  );
}

export async function getTagsForExpense(expenseId: string): Promise<Tag[]> {
  const rows = await executeSql<TagRow>(
    `SELECT t.* FROM tags t
     JOIN expense_tags et ON t.id = et.tag_id
     WHERE et.expense_id = ? AND et.is_deleted = 0 AND t.is_deleted = 0
     ORDER BY t.usage_count DESC`,
    [expenseId],
  );
  return rows.map(rowToTag);
}

export async function removeExpenseTag(expenseId: string, tagId: string): Promise<void> {
  await executeSql(
    'UPDATE expense_tags SET is_deleted = 1, updated_at = ? WHERE expense_id = ? AND tag_id = ?',
    [Date.now(), expenseId, tagId],
  );
}

export async function insertIncomeTag(incomeTag: {
  id: string;
  incomeId: string;
  tagId: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted?: boolean;
  syncVersion?: number;
}): Promise<void> {
  await executeSql(
    `INSERT INTO income_tags (
      id, income_id, tag_id, created_at, updated_at, is_deleted, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      incomeTag.id,
      incomeTag.incomeId,
      incomeTag.tagId,
      incomeTag.createdAt.getTime(),
      incomeTag.updatedAt.getTime(),
      incomeTag.isDeleted ? 1 : 0,
      incomeTag.syncVersion ?? 0,
    ],
  );
}

export async function getTagsForIncome(incomeId: string): Promise<Tag[]> {
  const rows = await executeSql<TagRow>(
    `SELECT t.* FROM tags t
     JOIN income_tags it ON t.id = it.tag_id
     WHERE it.income_id = ? AND it.is_deleted = 0 AND t.is_deleted = 0
     ORDER BY t.usage_count DESC`,
    [incomeId],
  );
  return rows.map(rowToTag);
}

export async function getAllExpenseTagMappings(accountId: string): Promise<{ expenseId: string; tagId: string }[]> {
  const rows = await executeSql<{ expense_id: string; tag_id: string }>(
    `SELECT et.expense_id, et.tag_id FROM expense_tags et
     JOIN tags t ON t.id = et.tag_id
     WHERE t.account_id = ? AND et.is_deleted = 0 AND t.is_deleted = 0`,
    [accountId],
  );
  return rows.map((r: { expense_id: string; tag_id: string }) => ({ expenseId: r.expense_id, tagId: r.tag_id }));
}
