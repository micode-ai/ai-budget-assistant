import { useMemo } from 'react';
import { useFilteredTransactions } from './useFilteredTransactions';
import { transactionDay } from './localDayKey';
import {
  buildCalendarHeatmap,
  busiestStretch,
  dayOfMonthAverages,
  type CalendarHeatmap,
} from './spendingCalendar';

/** Fewer spending days than this and the grid says nothing yet. */
const MIN_ACTIVE_DAYS = 14;

export interface SpendingCalendar {
  heatmap: CalendarHeatmap;
  dayOfMonth: { averages: number[]; months: number; busiestStart: number | null };
  anchored: boolean;
}

/**
 * The last year of spending day by day and the average per day of the month
 * (ABA-798). Independent of the period picker: it always ends today. Same
 * currency filter and conversion as the rest of the tab; null until there are
 * enough spending days to say anything.
 */
export function useSpendingCalendar(currencyCode?: string): SpendingCalendar | null {
  const { expenses, getAmount, anchorDay } = useFilteredTransactions('month', currencyCode);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  return useMemo(() => {
    const now = new Date();
    const rows = expenses
      .filter((e) => !e.isDeleted && (!currencyCode || e.currencyCode === currencyCode))
      .map((e) => ({ day: transactionDay(e.date), amount: getAmount(e) }));
    const heatmap = buildCalendarHeatmap(rows, now);
    if (heatmap.activeDays < MIN_ACTIVE_DAYS) return null;
    const dom = dayOfMonthAverages(rows, now, anchorDay);
    return {
      heatmap,
      dayOfMonth: { ...dom, busiestStart: dom.months > 0 ? busiestStretch(dom.averages) : null },
      // An anchor on the 1st is the calendar month: no "payday" wording for it.
      anchored: anchorDay !== null && anchorDay !== 1,
    };
    // `todayKey` rolls the memo over at midnight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, getAmount, currencyCode, anchorDay, todayKey]);
}
