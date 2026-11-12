/**
 * One-time SQLite data migrations at startup, remembered in `sync_metadata`.
 *
 * An unconditional backfill `UPDATE` in `initializeDatabase` rewrites (or at
 * least scans) a whole table on every launch. Guarded by a key, it runs once:
 * the statement and the flag write go in one transaction, so a crash between
 * them repeats the (idempotent) statement rather than skipping it.
 */
export interface RunOnceDb {
  getAllSync<T>(source: string, ...params: (string | number | null)[]): T[];
  runSync(source: string, ...params: (string | number | null)[]): unknown;
  execSync(source: string): void;
  withTransactionSync(task: () => void): void;
}

/** Run `sql` once per database, keyed by `key`. Returns true when it ran now. */
export function runOnceSync(db: RunOnceDb, key: string, sql: string): boolean {
  const done = db.getAllSync<{ value: string }>('SELECT value FROM sync_metadata WHERE key = ?', key);
  if (done.length > 0) return false;
  db.withTransactionSync(() => {
    db.execSync(sql);
    db.runSync(
      'INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES (?, ?, ?)',
      key,
      '1',
      Date.now(),
    );
  });
  return true;
}
