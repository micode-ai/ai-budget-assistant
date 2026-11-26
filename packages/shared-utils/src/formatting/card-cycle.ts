/**
 * Credit-card statement cycle maths. Pure; date-only, local calendar (never
 * `toISOString()`, which shifts the day).
 *
 * MIRROR: packages/shared-utils/src/formatting/card-cycle.ts holds an identical
 * copy (everything after this comment). The API cannot import shared-utils at
 * runtime (ABA-252/253), so the duplication is deliberate;
 * `cardCycleParity.test.ts` in the app fails if the two bodies drift. Change
 * both together.
 *
 * Cut-off rule: the TRANSACTION date decides which statement a purchase lands
 * on. Banks that cut off by posting date will differ by a day or two.
 */

export interface CardCycle {
  /** First day of the cycle (day after the previous statement day). */
  start: Date;
  /** Last day of the cycle, i.e. the statement day. */
  end: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** A day 29..31 clamps to the month's last day. */
export function clampDay(year: number, monthIndex: number, day: number): number {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(Math.max(day, 1), last);
}

function statementIn(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, clampDay(year, monthIndex, day));
}

/** The cycle that contains `today`; it ends on the next statement day on/after today. */
export function currentCycle(today: Date, statementDay: number): CardCycle {
  const t = dateOnly(today);
  let end = statementIn(t.getFullYear(), t.getMonth(), statementDay);
  if (end < t) end = statementIn(t.getFullYear(), t.getMonth() + 1, statementDay);
  const prev = statementIn(end.getFullYear(), end.getMonth() - 1, statementDay);
  return { start: new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1), end };
}

/** The cycle that closed most recently (its statement is the one currently payable). */
export function lastClosedCycle(today: Date, statementDay: number): CardCycle {
  const cur = currentCycle(today, statementDay);
  const prevEnd = new Date(cur.start.getFullYear(), cur.start.getMonth(), cur.start.getDate() - 1);
  const prevPrev = statementIn(prevEnd.getFullYear(), prevEnd.getMonth() - 1, statementDay);
  return {
    start: new Date(prevPrev.getFullYear(), prevPrev.getMonth(), prevPrev.getDate() + 1),
    end: prevEnd,
  };
}

/** The first `dueDay` strictly after the statement date. */
export function nextDueDate(statementDate: Date, dueDay: number): Date {
  const s = dateOnly(statementDate);
  let due = statementIn(s.getFullYear(), s.getMonth(), dueDay);
  if (due <= s) due = statementIn(s.getFullYear(), s.getMonth() + 1, dueDay);
  return due;
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysUntil(from: Date, to: Date): number {
  const a = dateOnly(from);
  const b = dateOnly(to);
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}
