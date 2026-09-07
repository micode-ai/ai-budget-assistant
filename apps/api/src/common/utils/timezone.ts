/**
 * Calendar arithmetic in a user's timezone rather than the server's.
 *
 * The API runs in UTC, so `date.getFullYear()` / `getMonth()` and a bare
 * `Intl.DateTimeFormat(...).format(date)` both answer in UTC. When the value
 * came from a client as an instant — a local midnight serialised with
 * `toISOString()` — that is one calendar day off for every user east of UTC,
 * which is how the analytics drill-down came to label September as August
 * (ABA-503).
 *
 * Every helper falls back to UTC on an unknown timezone string rather than
 * throwing: a label is never worth failing a request over. Same posture as
 * `todayInTimezone` in `ocr.service.ts`, which this generalises.
 */

export interface CalendarParts {
  year: number;
  /** 1-12, not the 0-11 `Date` convention — this is a calendar month. */
  month: number;
  day: number;
}

function safeTimeZone(timezone: string | null | undefined): string {
  const tz = timezone || 'UTC';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/**
 * The calendar date an instant falls on, as seen from `timezone`.
 * Uses `en-CA`, whose numeric format is `YYYY-MM-DD` — the same trick the OCR
 * service already relies on.
 */
export function calendarPartsInTimezone(
  date: Date,
  timezone: string | null | undefined,
): CalendarParts {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimeZone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
}

/**
 * Formats an instant with `Intl` options, resolved in the user's timezone.
 * Use this for any label derived from a date a client sent.
 */
export function formatInTimezone(
  date: Date,
  timezone: string | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: safeTimeZone(timezone),
  }).format(date);
}

/** `YYYY-MM` for an instant, as seen from `timezone`. Drill-down parent ids. */
export function yearMonthIdInTimezone(
  date: Date,
  timezone: string | null | undefined,
): string {
  const { year, month } = calendarPartsInTimezone(date, timezone);
  return `${year}-${String(month).padStart(2, '0')}`;
}
