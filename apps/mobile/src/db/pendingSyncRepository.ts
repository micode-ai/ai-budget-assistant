import { executeSql } from './client';
import type { PendingEntity, PendingRow } from '@/features/syncStatus/pendingSyncSummary';

/** Tables whose `sync_status` is a trustworthy pending marker (all have updated_at). */
export const PENDING_SYNC_TABLES: PendingEntity[] = [
  'expenses',
  'incomes',
  'account_transfers',
  'currency_exchanges',
  'budgets',
  'investment_transactions',
];

/**
 * Rows not yet acknowledged by the server, grouped per table and status. Web mock returns [].
 *
 * Soft-deleted rows are left out: a delete is sent once at delete time and its row is never
 * marked synced afterwards, and the push loops skip `isDeleted` rows, so a deleted row stays
 * `pending` forever. Counting them showed "Waiting to sync: 52" right after a successful sync
 * (ABA-729). The count must match what a sync would actually upload.
 */
export async function loadPendingRows(): Promise<PendingRow[]> {
  const out: PendingRow[] = [];
  for (const entity of PENDING_SYNC_TABLES) {
    // Sequential on purpose: one SQLite connection (see offline-first-sync wiki).
    const rows = await executeSql<{ status: string; n: number; oldest: number | null }>(
      `SELECT sync_status AS status, COUNT(*) AS n, MIN(updated_at) AS oldest
       FROM ${entity} WHERE sync_status IN ('pending', 'error') AND is_deleted = 0
       GROUP BY sync_status`,
    );
    for (const r of rows) {
      out.push({
        entity,
        status: r.status === 'error' ? 'error' : 'pending',
        count: Number(r.n),
        oldestUpdatedAt: Number(r.oldest ?? 0),
      });
    }
  }
  return out;
}
