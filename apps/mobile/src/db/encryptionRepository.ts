import { executeSql } from './client';

export async function getAccountKey(
  accountId: string,
): Promise<{ accountKey: string; keyVersion: number } | null> {
  const rows = await executeSql<{ account_key: string; key_version: number }>(
    'SELECT account_key, key_version FROM encryption_keys WHERE account_id = ?',
    [accountId],
  );
  if (rows.length === 0) return null;
  return {
    accountKey: rows[0].account_key,
    keyVersion: rows[0].key_version,
  };
}

export async function setAccountKey(
  accountId: string,
  accountKey: string,
  keyVersion: number,
): Promise<void> {
  const now = Date.now();
  await executeSql(
    `INSERT INTO encryption_keys (account_id, account_key, key_version, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET account_key = excluded.account_key, key_version = excluded.key_version, updated_at = excluded.updated_at`,
    [accountId, accountKey, keyVersion, now],
  );
}

export async function deleteAccountKey(accountId: string): Promise<void> {
  await executeSql('DELETE FROM encryption_keys WHERE account_id = ?', [accountId]);
}

export async function getAllAccountKeys(): Promise<
  Array<{ accountId: string; accountKey: string; keyVersion: number }>
> {
  const rows = await executeSql<{
    account_id: string;
    account_key: string;
    key_version: number;
  }>('SELECT account_id, account_key, key_version FROM encryption_keys', []);
  return rows.map((row) => ({
    accountId: row.account_id,
    accountKey: row.account_key,
    keyVersion: row.key_version,
  }));
}
