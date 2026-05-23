import { useState, useCallback, useMemo } from 'react';
import type { TimeRange } from '@/features/analytics/useAnalytics';

export function usePeriodNavigation(selectedRange: TimeRange, intlLocale: string) {
  const now = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-based
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const isCurrentPeriod = selectedRange === 'month'
    ? selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear()
    : selectedYear === now.getFullYear();

  const getPeriodLabel = useCallback((): string => {
    if (selectedRange === 'year') return `${selectedYear}`;
    const date = new Date(selectedYear, selectedMonth - 1, 1);
    const monthName = date.toLocaleDateString(intlLocale, { month: 'long' });
    return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${selectedYear}`;
  }, [selectedRange, selectedYear, selectedMonth, intlLocale]);

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
    setSelectedMonth(now.getMonth() + 1);
    setSelectedYear(now.getFullYear());
  }, [now]);

  return { selectedMonth, selectedYear, isCurrentPeriod, getPeriodLabel, goToPrevPeriod, goToNextPeriod, resetToCurrentPeriod };
}
