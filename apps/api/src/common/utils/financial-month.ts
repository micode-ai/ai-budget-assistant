/**
 * The account's "financial month" — a calendar month optionally shifted to
 * start on `anchorDay` instead of the 1st (salary lands on the 10th, so the
 * month runs 10 Aug - 9 Sep).
 *
 * MIRROR: packages/shared-utils/src/formatting/financial-month.ts holds a
 * copy for mobile that is identical through the end of shiftFinancialMonth()
 * (it then appends a mobile-only formatFinancialMonth() with no equivalent
 * here). The API cannot import shared-utils at runtime (no build step; prod
 * Node throws ERR_UNSUPPORTED_DIR_IMPORT -- see ABA-252/253 and
 * scripts/check-no-shared-utils-runtime-import.sh), so the duplication is
 * deliberate. Both copies are covered by the same case table through
 * shiftFinancialMonth(); change one, change the other -- financial-month.spec.ts
 * has a drift guard that fails CI if they diverge.
 *
 * All math is local-time on purpose. Moving to UTC would shift day boundaries.
 */

/** 1..31, or null for "use the calendar month". Anything else degrades to null. */
export function normalizeAnchorDay(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 1 || value > 31) return null;
  return value;
}

function daysInMonth(year: number, monthIndex: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Midnight on the anchor day of (year, monthIndex), clamped to the last day of
 * short months. monthIndex may be out of 0..11; it is normalized into the year.
 * Built explicitly rather than by mutating a Date, because setMonth() overflows.
 */
function anchorDateFor(year: number, monthIndex: number, anchorDay: number): Date {
  const y = year + Math.floor(monthIndex / 12);
  const m = ((monthIndex % 12) + 12) % 12;
  return new Date(y, m, Math.min(anchorDay, daysInMonth(y, m)), 0, 0, 0, 0);
}

/** The financial-month window containing `now`. */
export function financialMonth(
  now: Date,
  anchorDay: number | null,
): { start: Date; end: Date } {
  const anchor = normalizeAnchorDay(anchorDay);

  if (anchor === null) {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }

  const thisAnchor = anchorDateFor(now.getFullYear(), now.getMonth(), anchor);
  const start =
    now.getTime() >= thisAnchor.getTime()
      ? thisAnchor
      : anchorDateFor(now.getFullYear(), now.getMonth() - 1, anchor);

  const nextAnchor = anchorDateFor(start.getFullYear(), start.getMonth() + 1, anchor);
  return { start, end: new Date(nextAnchor.getTime() - 1) };
}

/**
 * A reference date guaranteed to fall INSIDE the period `delta` steps from the
 * one containing `ref`. Feed it back into financialMonth() to get the window.
 * Returns noon to stay clear of DST transitions.
 */
export function shiftFinancialMonth(
  ref: Date,
  delta: number,
  anchorDay: number | null,
): Date {
  const anchor = normalizeAnchorDay(anchorDay);

  if (anchor === null) {
    return new Date(ref.getFullYear(), ref.getMonth() + delta, 1, 12, 0, 0, 0);
  }

  const { start } = financialMonth(ref, anchor);
  const shifted = anchorDateFor(start.getFullYear(), start.getMonth() + delta, anchor);
  return new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate(), 12, 0, 0, 0);
}
