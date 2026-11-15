/**
 * `YYYY-MM-DD` of the LOCAL calendar day a transaction belongs to.
 *
 * Never `toISOString().split('T')[0]`: that is the UTC day, so in any zone east
 * of UTC an expense made after local midnight lands on the previous day's bar
 * (docs/wiki/features/date-pickers.md). A bare `YYYY-MM-DD` string is already a
 * calendar day and is returned as-is — `new Date('2026-06-01')` would read it as
 * UTC midnight and shift it west of UTC.
 */
export function localDayKey(value: Date | string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
