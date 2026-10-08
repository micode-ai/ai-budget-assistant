/**
 * The calendar month before `now` as route params for the monthly Wrapped deck (ABA-641):
 * `{ year: '2026', month: '9' }`. January rolls back to December of the year before.
 */
export function previousMonthParams(now: Date = new Date()): { year: string; month: string } {
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: String(prev.getFullYear()), month: String(prev.getMonth() + 1) };
}
