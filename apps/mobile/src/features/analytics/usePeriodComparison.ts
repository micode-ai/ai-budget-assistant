import { useMemo } from 'react';
import { useFilteredTransactions } from './useFilteredTransactions';
import { comparablePreviousWindow, inWindow } from './periodWindows';
import type { TimeRange, PeriodComparison } from './useAnalytics';

export function usePeriodComparison(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
) {
  const { expenses, filteredExpenses, getAmount, toDisplayCurrency, dateRange, anchorDay } =
    useFilteredTransactions(timeRange, currencyCode, selectedMonth, selectedYear);

  const periodComparison = useMemo((): PeriodComparison => {
    const currentTotal = filteredExpenses.reduce((sum, e) => sum + getAmount(e), 0);

    // The period before (financial months honour the anchor day), cut to the same days while this one is in
    // progress — see periodWindows.ts for why a partial-vs-whole comparison is wrong.
    const window = comparablePreviousWindow(timeRange, dateRange, new Date(), anchorDay);

    const previousTotal = expenses
      .filter((e) => {
        if (e.isDeleted) return false;
        if (currencyCode && e.currencyCode !== currencyCode) return false;
        return inWindow(new Date(e.date), window);
      })
      .reduce((sum, e) => sum + toDisplayCurrency(e.amount, e.currencyCode), 0);

    const changePercent =
      previousTotal > 0
        ? ((currentTotal - previousTotal) / previousTotal) * 100
        : currentTotal > 0
          ? 100
          : 0;

    return { currentTotal, previousTotal, changePercent, isPartial: window.partial };
  }, [filteredExpenses, expenses, dateRange, timeRange, currencyCode, getAmount, toDisplayCurrency, anchorDay]);

  return { periodComparison };
}
