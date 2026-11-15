/**
 * Date windows for the Analytics tab's comparisons ("vs last month",
 * "vs 3-month average", the per-category chips and the anomaly list).
 *
 * The rule they all share: an IN-PROGRESS period is compared with the SAME
 * number of days of the earlier period, never with the whole of it. On the 5th,
 * five days of spending against a full previous month always read as "−80%",
 * in green — a fact about the calendar, not about the user's spending.
 *
 * A finished (or future) period is compared whole, against the calendar
 * period before it — February for March, not "the 29 days before the 1st".
 *
 * Every window here is half-open: `start <= date < end`.
 *
 * Pure and store-free so it can be unit-tested directly.
 */
import type { TimeRange } from './useAnalytics';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface DateWindow {
  start: Date;
  /** Exclusive. */
  end: Date;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** Whole calendar days between two local midnights (DST-safe). */
function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

/** True while `now` falls inside the period. */
export function isInProgress(range: DateRange, now: Date = new Date()): boolean {
  return now >= range.startDate && now <= range.endDate;
}

/** Calendar days the period spans, inclusive of both ends. */
export function totalDays(range: DateRange): number {
  return daysBetween(range.startDate, range.endDate) + 1;
}

/**
 * Days of the period that have happened: through today while it is in
 * progress, the whole period once it is over. A period still entirely in the
 * future counts as whole, so an average never divides by zero.
 */
export function elapsedDays(range: DateRange, now: Date = new Date()): number {
  if (!isInProgress(range, now)) return totalDays(range);
  return daysBetween(range.startDate, now) + 1;
}

/** Shortens `[start, nextStart)` to its first `days` days when `days` is given. */
function sameDays(start: Date, nextStart: Date, days: number | null): DateWindow {
  if (days === null) return { start, end: nextStart };
  const cut = addDays(start, days);
  return { start, end: cut < nextStart ? cut : nextStart };
}

/**
 * The window to compare the current period against: the calendar period
 * before it, cut to the same number of days while the current one is in
 * progress. `partial` tells the UI to say "at this point last month" rather
 * than "last month".
 */
export function comparablePreviousWindow(
  timeRange: TimeRange,
  range: DateRange,
  now: Date = new Date(),
): DateWindow & { partial: boolean } {
  const s = range.startDate;
  let prevStart: Date;
  switch (timeRange) {
    case 'week':
      prevStart = addDays(s, -7);
      break;
    case 'month':
      prevStart = new Date(s.getFullYear(), s.getMonth() - 1, 1);
      break;
    case 'year':
      prevStart = new Date(s.getFullYear() - 1, 0, 1);
      break;
  }
  const partial = isInProgress(range, now);
  return { ...sameDays(prevStart, startOfDay(s), partial ? elapsedDays(range, now) : null), partial };
}

/**
 * The `count` calendar months before the period's start month, each cut to the
 * same number of days while the period is in progress (the 31st compares with
 * all of February). Index 0 is the month right before.
 */
export function trailingMonthWindows(range: DateRange, count: number, now: Date = new Date()): DateWindow[] {
  const days = isInProgress(range, now) ? elapsedDays(range, now) : null;
  const s = range.startDate;
  return Array.from({ length: count }, (_, idx) => {
    const i = idx + 1;
    const start = new Date(s.getFullYear(), s.getMonth() - i, 1);
    const nextStart = new Date(s.getFullYear(), s.getMonth() - i + 1, 1);
    return sameDays(start, nextStart, days);
  });
}

export function inWindow(date: Date, w: DateWindow): boolean {
  return date >= w.start && date < w.end;
}
