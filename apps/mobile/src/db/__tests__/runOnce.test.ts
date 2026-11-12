/**
 * R14: the `server_known` backfill (and any one-time data migration) runs once
 * per database, not on every launch.
 */
import { runOnceSync, type RunOnceDb } from '../runOnce';

function fakeDb() {
  const meta = new Map<string, string>();
  const executed: string[] = [];
  const db: RunOnceDb = {
    getAllSync: <T,>(_sql: string, key: unknown) => (meta.has(String(key)) ? [{ value: meta.get(String(key)) }] : []) as T[],
    runSync: (_sql: string, key: unknown, value: unknown) => {
      meta.set(String(key), String(value));
      return undefined;
    },
    execSync: (sql: string) => {
      executed.push(sql);
    },
    withTransactionSync: (task: () => void) => task(),
  };
  return { db, meta, executed };
}

describe('runOnceSync', () => {
  it('runs the statement on the first launch and records the flag', () => {
    const { db, meta, executed } = fakeDb();
    expect(runOnceSync(db, 'migration:x', 'UPDATE t SET a = 1')).toBe(true);
    expect(executed).toEqual(['UPDATE t SET a = 1']);
    expect(meta.get('migration:x')).toBe('1');
  });

  it('does not run it again on later launches', () => {
    const { db, executed } = fakeDb();
    runOnceSync(db, 'migration:x', 'UPDATE t SET a = 1');
    expect(runOnceSync(db, 'migration:x', 'UPDATE t SET a = 1')).toBe(false);
    expect(executed).toHaveLength(1);
  });

  it('does not record the flag when the statement throws, so the next launch retries', () => {
    const { db, meta } = fakeDb();
    db.execSync = () => {
      throw new Error('boom');
    };
    expect(() => runOnceSync(db, 'migration:x', 'UPDATE t SET a = 1')).toThrow('boom');
    expect(meta.has('migration:x')).toBe(false);
  });
});
