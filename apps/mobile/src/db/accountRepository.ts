import { executeSql } from './client';
import type { Account, AccountMember, AccountType, AccountRole, Currency } from '@budget/shared-types';

interface AccountRow {
  id: string;
  name: string;
  type: string;
  currency_code: string;
  owner_id: string;
  icon: string | null;
  is_active: number;
  my_role: string;
  created_at: number;
  updated_at: number;
}

interface AccountMemberRow {
  id: string;
  account_id: string;
  user_id: string;
  role: string;
  user_name: string | null;
  user_email: string | null;
  joined_at: number;
}

function rowToAccount(row: AccountRow): Account & { myRole: AccountRole } {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AccountType,
    currencyCode: row.currency_code as Currency,
    ownerId: row.owner_id,
    icon: row.icon ?? undefined,
    isActive: row.is_active === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    myRole: row.my_role as AccountRole,
  };
}

function rowToMember(row: AccountMemberRow): AccountMember {
  return {
    id: row.id,
    accountId: row.account_id,
    userId: row.user_id,
    role: row.role as AccountRole,
    joinedAt: new Date(row.joined_at),
    user: {
      id: row.user_id,
      name: row.user_name ?? '',
      email: row.user_email ?? '',
    },
  };
}

export async function loadAllAccounts(): Promise<(Account & { myRole: AccountRole })[]> {
  const rows = await executeSql<AccountRow>(
    'SELECT * FROM accounts WHERE is_active = 1 ORDER BY created_at ASC',
  );
  return rows.map(rowToAccount);
}

export async function insertAccount(
  account: Account,
  myRole: AccountRole,
): Promise<void> {
  await executeSql(
    `INSERT OR REPLACE INTO accounts (
      id, name, type, currency_code, owner_id, icon, is_active, my_role, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      account.id,
      account.name,
      account.type,
      account.currencyCode,
      account.ownerId,
      account.icon ?? null,
      account.isActive ? 1 : 0,
      myRole,
      account.createdAt instanceof Date ? account.createdAt.getTime() : account.createdAt,
      account.updatedAt instanceof Date ? account.updatedAt.getTime() : account.updatedAt,
    ],
  );
}

export async function updateAccountInDb(
  id: string,
  updates: Partial<Account>,
): Promise<void> {
  const setClauses: string[] = [];
  const params: (string | number | null)[] = [];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    params.push(updates.name);
  }
  if (updates.icon !== undefined) {
    setClauses.push('icon = ?');
    params.push(updates.icon ?? null);
  }
  if (updates.currencyCode !== undefined) {
    setClauses.push('currency_code = ?');
    params.push(updates.currencyCode);
  }
  if (updates.isActive !== undefined) {
    setClauses.push('is_active = ?');
    params.push(updates.isActive ? 1 : 0);
  }

  if (setClauses.length === 0) return;

  setClauses.push('updated_at = ?');
  params.push(Date.now());
  params.push(id);

  await executeSql(
    `UPDATE accounts SET ${setClauses.join(', ')} WHERE id = ?`,
    params,
  );
}

export async function deleteAccountFromDb(id: string): Promise<void> {
  await executeSql('DELETE FROM accounts WHERE id = ?', [id]);
}

export async function insertAccounts(
  accounts: Array<Account & { myRole?: AccountRole }>,
  userId: string,
): Promise<void> {
  for (const account of accounts) {
    const myRole = account.myRole ?? (account.ownerId === userId ? 'owner' : 'editor');
    await insertAccount(account, myRole as AccountRole);
  }
}

// Account Members

export async function loadMembersByAccountId(accountId: string): Promise<AccountMember[]> {
  const rows = await executeSql<AccountMemberRow>(
    'SELECT * FROM account_members WHERE account_id = ? ORDER BY joined_at ASC',
    [accountId],
  );
  return rows.map(rowToMember);
}

export async function insertMembers(members: AccountMember[]): Promise<void> {
  for (const member of members) {
    await executeSql(
      `INSERT OR REPLACE INTO account_members (
        id, account_id, user_id, role, user_name, user_email, joined_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        member.id,
        member.accountId,
        member.userId,
        member.role,
        member.user?.name ?? null,
        member.user?.email ?? null,
        member.joinedAt instanceof Date ? member.joinedAt.getTime() : member.joinedAt,
      ],
    );
  }
}

export async function deleteMembersByAccountId(accountId: string): Promise<void> {
  await executeSql('DELETE FROM account_members WHERE account_id = ?', [accountId]);
}

export async function clearAllAccounts(): Promise<void> {
  await executeSql('DELETE FROM account_members', []);
  await executeSql('DELETE FROM accounts', []);
}
