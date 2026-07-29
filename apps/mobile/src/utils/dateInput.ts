/**
 * Conversions between a `Date` and the `YYYY-MM-DD` string an HTML
 * `<input type="date">` reads and writes.
 *
 * Both directions deliberately avoid `toISOString()` / `new Date(string)`:
 * those go through UTC, so for any non-zero timezone offset the calendar day
 * shifts. A user in UTC+2 picking the 1st would store the previous month's
 * last day; a user in UTC-5 would see the day after the one they picked. The
 * transaction date is a calendar day (`@db.Date` on both `expenses` and
 * `incomes`), so it must be read and written in local components only.
 */

/** `Date` -> `YYYY-MM-DD`, using the LOCAL calendar day. */
export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * `YYYY-MM-DD` -> `Date` in the LOCAL timezone, carrying over the time of day
 * from `base` (the native pickers keep the original time when only the date
 * changes, so this matches them).
 *
 * Returns `null` for an empty or malformed value — a partially typed date, or
 * a cleared input, must not produce an `Invalid Date` that then silently
 * lands in the store.
 */
export function fromDateInputValue(value: string, base: Date): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const next = new Date(
    year,
    month - 1,
    day,
    base.getHours(),
    base.getMinutes(),
    base.getSeconds(),
    base.getMilliseconds(),
  );

  // Rejects real-world-invalid days that the range check above lets through
  // (e.g. 2026-02-31, which JS would roll forward into March).
  if (next.getFullYear() !== year || next.getMonth() !== month - 1 || next.getDate() !== day) {
    return null;
  }
  return next;
}
