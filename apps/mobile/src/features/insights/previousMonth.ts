import { financialMonth, shiftFinancialMonth } from '@budget/shared-utils';

/**
 * The month before the current one as route params for the monthly Wrapped deck (ABA-641):
 * `{ year: '2026', month: '9' }`. January rolls back to December of the year before.
 *
 * With an anchor day it is the previous FINANCIAL month, named by the month it started in
 * (ABA-782): with salary on the 10th, on 5 November the current period is October, so the
 * one just ended is September (10 Sep – 9 Oct) — the deck the anchor-day push announced.
 * Pure on purpose: the caller reads the anchor (`readAnchorDay()`), so this module stays
 * free of the store graph and testable on its own.
 */
export function previousMonthParams(
  now: Date = new Date(),
  anchorDay: number | null = null,
): { year: string; month: string } {
  const prev = financialMonth(shiftFinancialMonth(now, -1, anchorDay), anchorDay).start;
  return { year: String(prev.getFullYear()), month: String(prev.getMonth() + 1) };
}
