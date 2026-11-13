import { toDateInputValue } from '@/utils/dateInput';

/**
 * The Statement PDF's pure half: who may request it, when, and for which
 * period. The server enforces every rule again (`@RequireTier('pro')`,
 * `ViewerBlockGuard`, 403 `ENCRYPTED_ACCOUNT`); checking here first is what
 * lets the app say WHY instead of failing.
 *
 * The server is the source of truth for the PDF (spec decision 1), so the app
 * flushes its queues first and refuses while anything for the account is
 * still pending — a statement that silently misses the expense the parent
 * just attributed offline is worse than none.
 */

export type StatementGate = 'ok' | 'pro' | 'encrypted' | 'pending' | 'viewer';

export function canRequestStatement(state: {
  tier: string;
  encryptionTier: number;
  pendingChanges: number;
  canEdit: boolean;
}): StatementGate {
  // A viewer first: upgrading would not help them, so the paywall would be a lie.
  if (!state.canEdit) return 'viewer';
  if (state.tier !== 'pro' && state.tier !== 'business') return 'pro';
  if (state.encryptionTier !== 0) return 'encrypted';
  if (state.pendingChanges > 0) return 'pending';
  return 'ok';
}

interface SyncedRow {
  accountId: string;
  syncStatus?: string | null;
  isDeleted?: boolean | null;
}

/**
 * What this account still owes the server: queued child-cost changes plus
 * expenses and incomes not synced. A pending soft delete counts too — until it
 * lands the server would still print that expense.
 */
export function countPendingForAccount(
  accountId: string,
  sources: { queuedChildChanges: number; expenses: SyncedRow[]; incomes: SyncedRow[] },
): number {
  const pending = (rows: SyncedRow[]) =>
    rows.filter((r) => r.accountId === accountId && r.syncStatus === 'pending').length;
  return sources.queuedChildChanges + pending(sources.expenses) + pending(sources.incomes);
}

export type StatementPeriodKind = 'thisYear' | 'lastYear' | 'last12Months';

export const STATEMENT_PERIODS: StatementPeriodKind[] = ['thisYear', 'lastYear', 'last12Months'];

/** The period's boundaries as local calendar days (never `toISOString()`, which shifts the day). */
export function statementPeriod(kind: StatementPeriodKind, now: Date = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  const today = toDateInputValue(now);
  switch (kind) {
    case 'lastYear':
      return { from: toDateInputValue(new Date(y - 1, 0, 1)), to: toDateInputValue(new Date(y - 1, 11, 31)) };
    case 'last12Months':
      return { from: toDateInputValue(new Date(y, now.getMonth() - 11, 1)), to: today };
    case 'thisYear':
    default:
      return { from: toDateInputValue(new Date(y, 0, 1)), to: today };
  }
}

export type StatementFailure = Exclude<StatementGate, 'ok'> | 'failed';

/** A server refusal as a gate code; anything else (network, 5xx) is `failed`. */
export function statementErrorCode(err: unknown): StatementFailure {
  const e = (err ?? {}) as { status?: unknown; code?: unknown };
  // Only a recognised code is believed; any other 403 is not proof of a viewer.
  if (e.status === 403 && e.code === 'TIER_REQUIRED') return 'pro';
  if (e.status === 403 && e.code === 'ENCRYPTED_ACCOUNT') return 'encrypted';
  return 'failed';
}

/** The saved file's name. Never the child's name: it would land in download histories and share sheets. */
export function statementFileName(period: { from: string; to: string }): string {
  return `child-statement_${period.from}_${period.to}.pdf`;
}

/**
 * Whether the flush cannot be trusted to have delivered what was pending.
 * The expense push marks a row synced even when its request failed (a
 * separate defect), so a re-count after the flush can read 0 for an expense
 * that never reached the server; the snapshot taken BEFORE the flush, with the
 * device offline or any flush call having thrown, is what catches it.
 */
export function flushLeftPending(s: { pendingBefore: number; offline: boolean; flushFailed: boolean }): boolean {
  return s.pendingBefore > 0 && (s.offline || s.flushFailed);
}

export interface StatementPreflightDeps {
  tier: () => string;
  canEdit: () => boolean;
  /** Pending expenses + incomes of the account, as the stores hold them now. */
  snapshotPending: () => number;
  isOffline: () => boolean;
  flushChildQueue: () => Promise<void>;
  flushExpenses: () => Promise<void>;
  flushIncomes: () => Promise<void>;
  /** Queued child-cost changes still deliverable (undeliverable line changes excluded, R12). */
  countQueuedChildChanges: () => Promise<number>;
  /**
   * Expense and income deletes the server has not acknowledged (ABA-749, ABA-754).
   * They are gone from the stores, so `snapshotPending` cannot see them, yet the
   * server would still print those rows.
   */
  countPendingDeletes?: () => Promise<number>;
  readEncryptionTier: () => Promise<number>;
}

/**
 * The gate path the Statement PDF action runs before requesting: role and
 * tier first (nothing is flushed for a request that cannot happen), then the
 * flush, then the re-count, then the account's encryption tier. An unreadable
 * queue is `pending` (unknown is not "nothing"); an unreadable encryption tier
 * is left to the server, which refuses with ENCRYPTED_ACCOUNT itself.
 */
export async function statementPreflight(d: StatementPreflightDeps): Promise<StatementGate> {
  const early = canRequestStatement({ tier: d.tier(), encryptionTier: 0, pendingChanges: 0, canEdit: d.canEdit() });
  if (early !== 'ok') return early;

  const pendingBefore = d.snapshotPending();
  const offlineBefore = d.isOffline();
  let flushFailed = false;
  for (const flush of [d.flushChildQueue, d.flushExpenses, d.flushIncomes]) {
    try {
      await flush();
    } catch {
      flushFailed = true;
    }
  }
  if (flushLeftPending({ pendingBefore, offline: offlineBefore || d.isOffline(), flushFailed })) return 'pending';

  let queued: number;
  try {
    queued = (await d.countQueuedChildChanges()) + ((await d.countPendingDeletes?.()) ?? 0);
  } catch {
    return 'pending';
  }

  let encryptionTier = 0;
  try {
    encryptionTier = await d.readEncryptionTier();
  } catch {
    encryptionTier = 0;
  }

  return canRequestStatement({
    tier: d.tier(),
    encryptionTier,
    pendingChanges: queued + d.snapshotPending(),
    canEdit: d.canEdit(),
  });
}
