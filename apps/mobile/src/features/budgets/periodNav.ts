import { financialMonth, shiftFinancialMonth, getStartOfWeek, formatFinancialMonth } from '@budget/shared-utils';

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

/**
 * The budget's own current period as a concrete date range (e.g.
 * "10 Aug – 9 Sep"), for every period type — not only monthly. Returns ONLY
 * the range; the caller prints the period-type word
 * (`t('budgets.periods.<period>')`) beside it, exactly as the mobile card
 * already does.
 *
 * The "small extraction" the desktop design calls for: `BudgetDetailView`'s
 * own `formatPeriodLabel`/`monthlyHeading` already compute this same math,
 * scoped to the detail screen — pulling it out here (additive, that
 * component's own copy is untouched) is what lets the desktop card grid
 * show it too, without a third hand-copied implementation.
 *
 * `custom` has no "current period" to navigate — it shows the budget's own
 * fixed `startDate`/`endDate` instead, passed in via `customRange` (the
 * caller already has the budget in scope; this function stays a pure
 * period+date-in, string-out helper otherwise).
 */
export function formatBudgetPeriodRange(
  period: string,
  referenceDate: Date,
  anchorDay: number | null,
  locale: string,
  customRange?: { startDate: Date; endDate?: Date },
): string {
  const shortDate = (d: Date) => d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });

  switch (period) {
    case 'daily':
      return shortDate(referenceDate);
    case 'weekly': {
      const start = getStartOfWeek(referenceDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return `${shortDate(start)} – ${shortDate(end)}`;
    }
    case 'yearly':
      return String(referenceDate.getFullYear());
    case 'monthly': {
      const { start, end } = financialMonth(referenceDate, anchorDay);
      return formatFinancialMonth(start, end, locale).range;
    }
    case 'custom':
      if (!customRange) return '';
      return customRange.endDate
        ? `${shortDate(customRange.startDate)} – ${shortDate(customRange.endDate)}`
        : shortDate(customRange.startDate);
    default:
      return '';
  }
}
