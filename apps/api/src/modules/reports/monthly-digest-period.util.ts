import { financialMonth, shiftFinancialMonth } from '../../common/utils/financial-month';

export interface DigestPeriods {
  /** The period that ended yesterday — what the digest reports on. */
  start: Date;
  /** Midnight of its last day (expense and income dates are date-only). */
  end: Date;
  /** The period before it, for the month-over-month change. */
  prevStart: Date;
  prevEnd: Date;
  /** "October 2026", or "October 2026 (10 Oct – 9 Nov)" for an anchored month. */
  label: string;
}

const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * The monthly digest goes out on the day the account's month turns over —
 * the 1st for a calendar account, the anchor day for a financial month
 * (ABA-791) — and reports on the period that ended yesterday. Returns null on
 * any other day. A month is named by the month it starts in.
 */
export function digestPeriodsEndingYesterday(now: Date, anchorDay: number | null): DigestPeriods | null {
  const today = dayOf(now);
  const { start: currentStart } = financialMonth(now, anchorDay);
  if (currentStart.getTime() !== today.getTime()) return null;

  const prev = financialMonth(shiftFinancialMonth(currentStart, -1, anchorDay), anchorDay);
  const prevPrev = financialMonth(shiftFinancialMonth(currentStart, -2, anchorDay), anchorDay);

  const monthName = prev.start.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  const dayMonth = (d: Date) => d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  const label = anchorDay ? `${monthName} (${dayMonth(prev.start)} – ${dayMonth(prev.end)})` : monthName;

  return {
    start: prev.start,
    end: dayOf(prev.end),
    prevStart: prevPrev.start,
    prevEnd: dayOf(prevPrev.end),
    label,
  };
}
