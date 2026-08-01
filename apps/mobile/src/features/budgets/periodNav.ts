import { financialMonth, shiftFinancialMonth, getStartOfWeek } from '@budget/shared-utils';

/**
 * Period navigation for the budget detail screen. Pure so it can be tested
 * without rendering; an anchored monthly period spans two calendar months, so
 * "same month" comparisons are wrong and must go through financialMonth().
 */
export function isCurrentBudgetPeriod(
  period: string,
  ref: Date,
  anchorDay: number | null,
  now: Date = new Date(),
): boolean {
  switch (period) {
    case 'daily':
      return ref.toDateString() === now.toDateString();
    case 'weekly':
      return getStartOfWeek(ref).getTime() === getStartOfWeek(now).getTime();
    case 'yearly':
      return ref.getFullYear() === now.getFullYear();
    case 'monthly':
      return (
        financialMonth(ref, anchorDay).start.getTime() ===
        financialMonth(now, anchorDay).start.getTime()
      );
    default:
      return true;
  }
}

export function stepBudgetPeriod(
  period: string,
  ref: Date,
  delta: 1 | -1,
  anchorDay: number | null,
): Date {
  switch (period) {
    case 'daily':
      return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + delta, 12);
    case 'weekly':
      // Deliberately NOT wrapped in getStartOfWeek: isCurrentBudgetPeriod's
      // weekly branch and the screen's label formatter both normalize via
      // getStartOfWeek at comparison/render time, so the returned reference
      // only needs to land somewhere inside the target week.
      return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 7 * delta, 12);
    case 'yearly':
      return new Date(ref.getFullYear() + delta, ref.getMonth(), 1, 12);
    case 'monthly':
      return shiftFinancialMonth(ref, delta, anchorDay);
    default:
      return ref;
  }
}
