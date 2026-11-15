import { useState, useCallback, useEffect } from 'react';
import { financialMonth, formatFinancialMonth } from '@budget/shared-utils';
import type { TimeRange } from '@/features/analytics/useAnalytics';
import { useFinancialMonth } from './useFinancialMonth';

/**
 * Month/year navigation for the Analytics tab.
 *
 * A "month" is the account's FINANCIAL month: with salary on the 10th,
 * `selectedMonth` 10 is 10 Oct – 9 Nov, named by the month it starts in (the
 * formatFinancialMonth convention) — so on 5 November the current period is
 * still October. With no anchor day this is exactly the calendar month.
 */
export function usePeriodNavigation(selectedRange: TimeRange, intlLocale: string) {
  const { anchorDay, current } = useFinancialMonth();
  const currentMonth = current.start.getMonth() + 1; // 1-based
  const currentMonthYear = current.start.getFullYear();
  const currentYear = new Date().getFullYear();

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentMonthYear);

  // A different account (or a changed anchor) can move the current period:
  // snap back to it rather than keep a month chosen under another anchor.
  useEffect(() => {
    setSelectedMonth(currentMonth);
    setSelectedYear(currentMonthYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorDay]);

  const isCurrentPeriod = selectedRange === 'month'
    ? selectedMonth === currentMonth && selectedYear === currentMonthYear
    : selectedYear === currentYear;

  const getPeriodLabel = useCallback((): string => {
    if (selectedRange === 'year') return `${selectedYear}`;
    const date = new Date(selectedYear, selectedMonth - 1, 1);
    const monthName = date.toLocaleDateString(intlLocale, { month: 'long' });
    return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${selectedYear}`;
  }, [selectedRange, selectedYear, selectedMonth, intlLocale]);

  /**
   * The exact span ("10 Oct – 9 Nov") when the month view shows an anchored
   * financial month — the label alone would read as a calendar month. Null
   * otherwise, and the headers then show no second line.
   */
  const getPeriodRange = useCallback((): string | null => {
    if (selectedRange !== 'month' || anchorDay === null) return null;
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const inside = new Date(selectedYear, selectedMonth - 1, Math.min(anchorDay, daysInMonth), 12);
    const { start, end } = financialMonth(inside, anchorDay);
    return formatFinancialMonth(start, end, intlLocale).range;
  }, [selectedRange, selectedYear, selectedMonth, anchorDay, intlLocale]);

  const goToPrevPeriod = useCallback(() => {
    if (selectedRange === 'year') {
      setSelectedYear((y) => y - 1);
    } else {
      if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear((y) => y - 1); }
      else { setSelectedMonth((m) => m - 1); }
    }
  }, [selectedRange, selectedMonth]);

  const goToNextPeriod = useCallback(() => {
    if (isCurrentPeriod) return;
    if (selectedRange === 'year') {
      setSelectedYear((y) => y + 1);
    } else {
      if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear((y) => y + 1); }
      else { setSelectedMonth((m) => m + 1); }
    }
  }, [selectedRange, selectedMonth, isCurrentPeriod]);

  const resetToCurrentPeriod = useCallback(() => {
    setSelectedMonth(currentMonth);
    setSelectedYear(currentMonthYear);
  }, [currentMonth, currentMonthYear]);

  return {
    selectedMonth,
    selectedYear,
    isCurrentPeriod,
    getPeriodLabel,
    getPeriodRange,
    goToPrevPeriod,
    goToNextPeriod,
    resetToCurrentPeriod,
  };
}
