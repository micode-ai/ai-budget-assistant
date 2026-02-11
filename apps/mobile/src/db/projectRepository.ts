import { executeSql } from './client';
import type { Project, SyncStatus, Currency } from '@budget/shared-types';

interface ProjectRow {
  id: string;
  account_id: string;
  client_id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  start_date: number | null;
  end_date: number | null;
  budget: number | null;
  currency_code: string | null;
  is_archived: number;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  sync_status: string;
  sync_version: number;
}

interface ProjectExpenseRow {
  id: string;
  project_id: string;
  expense_id: string;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  sync_version: number;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    accountId: row.account_id,
    localId: row.client_id,
    name: row.name,
    description: row.description ?? undefined,
    color: row.color ?? undefined,
    icon: row.icon ?? undefined,
    startDate: row.start_date ? new Date(row.start_date) : undefined,
    endDate: row.end_date ? new Date(row.end_date) : undefined,
    budget: row.budget ?? undefined,
    currencyCode: (row.currency_code as Currency) ?? undefined,
    isArchived: row.is_archived === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    isDeleted: row.is_deleted === 1,
    syncStatus: row.sync_status as SyncStatus,
    syncVersion: row.sync_version,
  };
}

function projectToParams(project: Project): (string | number | null)[] {
  return [
    project.id,
    project.accountId,
    project.localId,
    project.name,
    project.description ?? null,
    project.color ?? null,
    project.icon ?? null,
    project.startDate ? project.startDate.getTime() : null,
    project.endDate ? project.endDate.getTime() : null,
    project.budget ?? null,
    project.currencyCode ?? null,
    project.isArchived ? 1 : 0,
    project.createdAt.getTime(),
    project.updatedAt.getTime(),
    project.isDeleted ? 1 : 0,
    project.syncStatus,
    project.syncVersion,
  ];
}

export async function insertProject(project: Project): Promise<void> {
  await executeSql(
    `INSERT INTO projects (
      id, account_id, client_id, name, description, color, icon,
      start_date, end_date, budget, currency_code, is_archived,
      created_at, updated_at, is_deleted, sync_status, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectToParams(project),
  );
}

export async function upsertProject(project: Project): Promise<void> {
  await executeSql(
    `INSERT INTO projects (
      id, account_id, client_id, name, description, color, icon,
      start_date, end_date, budget, currency_code, is_archived,
      created_at, updated_at, is_deleted, sync_status, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      account_id = excluded.account_id,
      client_id = excluded.client_id,
      name = excluded.name,
      description = excluded.description,
      color = excluded.color,
      icon = excluded.icon,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      budget = excluded.budget,
      currency_code = excluded.currency_code,
      is_archived = excluded.is_archived,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      is_deleted = excluded.is_deleted,
      sync_status = excluded.sync_status,
      sync_version = excluded.sync_version`,
    projectToParams(project),
  );
}

export async function getAllProjects(accountId: string): Promise<Project[]> {
  const rows = await executeSql<ProjectRow>(
    'SELECT * FROM projects WHERE account_id = ? AND is_deleted = 0 ORDER BY created_at DESC',
    [accountId],
  );
  return rows.map(rowToProject);
}

export async function getProjectById(id: string): Promise<Project | null> {
  const rows = await executeSql<ProjectRow>(
    'SELECT * FROM projects WHERE id = ?',
    [id],
  );
  return rows.length > 0 ? rowToProject(rows[0]) : null;
}

export async function deleteProject(id: string): Promise<void> {
  await executeSql(
    'UPDATE projects SET is_deleted = 1, updated_at = ? WHERE id = ?',
    [Date.now(), id],
  );
}

export async function addExpenseToProject(projectExpense: {
  id: string;
  projectId: string;
  expenseId: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted?: boolean;
  syncVersion?: number;
}): Promise<void> {
  await executeSql(
    `INSERT INTO project_expenses (
      id, project_id, expense_id, created_at, updated_at, is_deleted, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      projectExpense.id,
      projectExpense.projectId,
      projectExpense.expenseId,
      projectExpense.createdAt.getTime(),
      projectExpense.updatedAt.getTime(),
      projectExpense.isDeleted ? 1 : 0,
      projectExpense.syncVersion ?? 0,
    ],
  );
}

export async function getProjectIdForExpense(expenseId: string): Promise<string | null> {
  const rows = await executeSql<{ project_id: string }>(
    'SELECT project_id FROM project_expenses WHERE expense_id = ? AND is_deleted = 0 LIMIT 1',
    [expenseId],
  );
  return rows.length > 0 ? rows[0].project_id : null;
}

export async function removeExpenseFromProject(projectId: string, expenseId: string): Promise<void> {
  await executeSql(
    'UPDATE project_expenses SET is_deleted = 1, updated_at = ? WHERE project_id = ? AND expense_id = ?',
    [Date.now(), projectId, expenseId],
  );
}

export async function getAllProjectExpenseMappings(accountId: string): Promise<{ projectId: string; expenseId: string }[]> {
  const rows = await executeSql<{ project_id: string; expense_id: string }>(
    `SELECT pe.project_id, pe.expense_id FROM project_expenses pe
     JOIN projects p ON p.id = pe.project_id
     WHERE p.account_id = ? AND pe.is_deleted = 0 AND p.is_deleted = 0`,
    [accountId],
  );
  return rows.map((r: { project_id: string; expense_id: string }) => ({ projectId: r.project_id, expenseId: r.expense_id }));
}
