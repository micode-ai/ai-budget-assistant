/**
 * `YYYY-MM-DD` of the calendar day a transaction belongs to.
 *
 * Transaction dates come in two shapes, and both must land on the day the
 * user meant:
 * - **Date-only values at UTC midnight.** Every movement date on the server is
 *   `@db.Date`, so a row pulled from the API is `…T00:00:00.000Z`. Its day is
 *   the UTC date — reading it in local time would move it to the previous day
 *   for everyone west of UTC.
 * - **Real local timestamps.** A row created on the device carries the moment
 *   it was entered until it round-trips through the server. Its day is the
 *   LOCAL date — `toISOString()` would move an after-midnight expense to the
 *   previous day for everyone east of UTC.
 * A value at exactly 00:00:00.000 UTC is therefore read as date-only; a real
 * timestamp landing on that exact millisecond is the accepted edge case.
 * A bare `YYYY-MM-DD` string is returned as-is.
 */
export function localDayKey(value: Date | string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  const utcMidnight =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  return utcMidnight
    ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
