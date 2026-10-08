/**
 * Pure helpers for the post-import report (ABA-643). Kept out of the component so the rules that
 * decide what gets created on the one tap are testable.
 */

/** Imports smaller than this skip the report and keep the plain "imported N rows" alert. */
export const MIN_REPORT_EXPENSES = 10; // mirrors the API's MIN_REPORT_EXPENSES

function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The next renewal on or after `today`. A statement is history: its "next charge" can already be in
 * the past, and the subscription manager books a renewal as an expense once that date is due — so a
 * past date would re-book a charge the import has just brought in.
 */
export function rollForwardRenewal(nextRenewalDate: string, cycle: 'monthly' | 'weekly', today: Date): string {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d = parseDay(nextRenewalDate);
  const anchorDay = d.getDate();
  let guard = 0;
  while (d < start && guard++ < 520) {
    if (cycle === 'weekly') d.setDate(d.getDate() + 7);
    else {
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(anchorDay, last));
    }
  }
  return formatDay(d);
}

/** The first day of the current month — a suggested monthly budget starts there. */
export function startOfMonth(today: Date): Date {
  return new Date(today.getFullYear(), today.getMonth(), 1);
}
