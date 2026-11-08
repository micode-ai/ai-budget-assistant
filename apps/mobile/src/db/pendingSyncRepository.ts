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

/** Rows not yet acknowledged by the server, grouped per table and status. Web mock returns []. */
export async function loadPendingRows(): Promise<PendingRow[]> {
  const out: PendingRow[] = [];
  for (const entity of PENDING_SYNC_TABLES) {
    // Sequential on purpose: one SQLite connection (see offline-first-sync wiki).
    const rows = await executeSql<{ status: string; n: number; oldest: number | null }>(
      `SELECT sync_status AS status, COUNT(*) AS n, MIN(updated_at) AS oldest
       FROM ${entity} WHERE sync_status IN ('pending', 'error') GROUP BY sync_status`,
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
