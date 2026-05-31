import { useMemo } from 'react';
import { useFilteredTransactions } from './useFilteredTransactions';
import type { TimeRange, PeriodComparison } from './useAnalytics';

export function usePeriodComparison(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
) {
  const { expenses, filteredExpenses, getAmount, toDisplayCurrency, dateRange } =
    useFilteredTransactions(timeRange, currencyCode, selectedMonth, selectedYear);

  const periodComparison = useMemo((): PeriodComparison => {
    const currentTotal = filteredExpenses.reduce((sum, e) => sum + getAmount(e), 0);

    const msRange = dateRange.endDate.getTime() - dateRange.startDate.getTime();
    const prevStart = new Date(dateRange.startDate.getTime() - msRange);
    const prevEnd = new Date(dateRange.startDate.getTime() - 1);

    const previousTotal = expenses
      .filter((e) => {
        if (e.isDeleted) return false;
        if (currencyCode && e.currencyCode !== currencyCode) return false;
        const d = new Date(e.date);
        return d >= prevStart && d <= prevEnd;
      })
      .reduce((sum, e) => sum + toDisplayCurrency(e.amount, e.currencyCode), 0);

    const changePercent =
      previousTotal > 0
        ? ((currentTotal - previousTotal) / previousTotal) * 100
        : currentTotal > 0
          ? 100
          : 0;

    return { currentTotal, previousTotal, changePercent };
  }, [filteredExpenses, expenses, dateRange, currencyCode, getAmount, toDisplayCurrency]);

  return { periodComparison };
}
