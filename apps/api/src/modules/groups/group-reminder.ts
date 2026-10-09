/**
 * Pure state machine for group balance reminders (ABA-653). No DI, no I/O.
 *
 * An EPISODE is an open balance of one sign on one app-user member row: it opens when |net| reaches
 * `REMINDER_MIN_BALANCE`, and ends when the balance drops below it or the sign flips (a flip opens a
 * new episode). Within an episode the first reminder is due `REMINDER_INTERVAL_DAYS` days after it
 * opened, then every `REMINDER_INTERVAL_DAYS` days after the previous one, at most
 * `REMINDER_MAX_PER_EPISODE` times. Days are whole UTC calendar days on the server clock.
 */

/** Below this (in group currency) a balance is not worth a push, and an open episode ends. */
export const REMINDER_MIN_BALANCE = 1;
export const REMINDER_INTERVAL_DAYS = 7;
export const REMINDER_MAX_PER_EPISODE = 4;

const DAY_MS = 86_400_000;

export interface ReminderState {
  balanceOpenSince: Date | null;
  balanceOpenSign: number | null;
  lastReminderAt: Date | null;
  reminderCount: number;
}

export interface ReminderStep {
  /** The columns to store after this run (before any reminder is sent). */
  next: ReminderState;
  /** True when this member may get a reminder in this run. */
  due: boolean;
}

export const CLOSED_STATE: ReminderState = {
  balanceOpenSince: null,
  balanceOpenSign: null,
  lastReminderAt: null,
  reminderCount: 0,
};

/** Whole UTC days since the epoch. */
export function utcDay(d: Date): number {
  return Math.floor(d.getTime() / DAY_MS);
}

export function sameUtcDay(a: Date | null | undefined, b: Date): boolean {
  return !!a && utcDay(a) === utcDay(b);
}

/** -1 owes, 1 is owed, 0 = no open balance worth reminding about. */
export function reminderSign(net: number): -1 | 0 | 1 {
  if (Math.abs(net) < REMINDER_MIN_BALANCE) return 0;
  return net < 0 ? -1 : 1;
}

export function nextReminderState(prev: ReminderState, net: number, now: Date): ReminderStep {
  const sign = reminderSign(net);
  if (sign === 0) return { next: CLOSED_STATE, due: false };

  if (!prev.balanceOpenSince || prev.balanceOpenSign !== sign) {
    // A new episode (first sight of an open balance, or the sign flipped): the clock starts today.
    return {
      next: { balanceOpenSince: now, balanceOpenSign: sign, lastReminderAt: null, reminderCount: 0 },
      due: false,
    };
  }

  const anchor = prev.lastReminderAt ?? prev.balanceOpenSince;
  const due =
    prev.reminderCount < REMINDER_MAX_PER_EPISODE &&
    utcDay(now) - utcDay(anchor) >= REMINDER_INTERVAL_DAYS &&
    !sameUtcDay(prev.lastReminderAt, now);
  return { next: prev, due };
}

export function reminderStateChanged(a: ReminderState, b: ReminderState): boolean {
  const t = (d: Date | null) => (d ? d.getTime() : null);
  return (
    t(a.balanceOpenSince) !== t(b.balanceOpenSince) ||
    (a.balanceOpenSign ?? null) !== (b.balanceOpenSign ?? null) ||
    t(a.lastReminderAt) !== t(b.lastReminderAt) ||
    a.reminderCount !== b.reminderCount
  );
}

export interface ReminderCandidate {
  userId: string;
  memberId: string;
  groupId: string;
  groupName: string;
  currencyCode: string;
  net: number;
  /** The state the reminder claim is a compare-and-swap against. */
  prev: ReminderState;
  /** For a debtor: the suggested transfer to open the settle screen on. */
  fromMemberId?: string;
  toMemberId?: string;
}

/** Keeps one candidate per user: the group with the largest |balance| (ties: lower group id). */
export function pickPerUser(best: Map<string, ReminderCandidate>, c: ReminderCandidate): void {
  const cur = best.get(c.userId);
  if (
    !cur ||
    Math.abs(c.net) > Math.abs(cur.net) ||
    (Math.abs(c.net) === Math.abs(cur.net) && c.groupId < cur.groupId)
  ) {
    best.set(c.userId, c);
  }
}
