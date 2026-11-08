/**
 * Pure summary of the rows still waiting to reach the server. Kept free of
 * React and SQLite so the visibility rule is unit-testable.
 */
export type PendingEntity =
  | 'expenses'
  | 'incomes'
  | 'account_transfers'
  | 'currency_exchanges'
  | 'budgets'
  | 'investment_transactions';

export interface PendingRow {
  entity: PendingEntity;
  status: 'pending' | 'error';
  /** Count of rows in this (entity, status) bucket. */
  count: number;
  /** Oldest `updated_at` (epoch ms) in the bucket. */
  oldestUpdatedAt: number;
}

export interface PendingSyncSummary {
  waiting: number;
  failed: number;
  total: number;
  visible: boolean;
  byEntity: Partial<Record<PendingEntity, number>>;
}

/** A brief offline stretch should stay quiet: pending rows only surface after this. */
export const PENDING_VISIBLE_AFTER_MS = 5 * 60 * 1000;

export const EMPTY_PENDING_SUMMARY: PendingSyncSummary = {
  waiting: 0,
  failed: 0,
  total: 0,
  visible: false,
  byEntity: {},
};

export function summarizePending(
  rows: PendingRow[],
  now: number,
  visibleAfterMs: number = PENDING_VISIBLE_AFTER_MS,
): PendingSyncSummary {
  let waiting = 0;
  let failed = 0;
  let stale = false;
  const byEntity: Partial<Record<PendingEntity, number>> = {};
  for (const row of rows) {
    if (row.count <= 0) continue;
    byEntity[row.entity] = (byEntity[row.entity] ?? 0) + row.count;
    if (row.status === 'error') {
      failed += row.count;
    } else {
      waiting += row.count;
      if (now - row.oldestUpdatedAt >= visibleAfterMs) stale = true;
    }
  }
  return { waiting, failed, total: waiting + failed, visible: failed > 0 || stale, byEntity };
}
