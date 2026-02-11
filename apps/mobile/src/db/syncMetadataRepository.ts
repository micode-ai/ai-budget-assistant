import { executeSql } from './client';

export async function getLastSyncTime(): Promise<number | null> {
  const rows = await executeSql<{ value: string }>(
    'SELECT value FROM sync_metadata WHERE key = ?',
    ['lastSyncTime'],
  );
  return rows.length > 0 ? Number(rows[0].value) : null;
}

export async function setLastSyncTime(timestamp: number): Promise<void> {
  await executeSql(
    `INSERT INTO sync_metadata (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ['lastSyncTime', String(timestamp), timestamp],
  );
}
