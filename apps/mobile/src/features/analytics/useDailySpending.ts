import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFilteredTransactions } from './useFilteredTransactions';
import type { TimeRange, DailySpending } from './useAnalytics';

export function useDailySpending(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
) {
  const { t } = useTranslation();
  const { filteredExpenses, getAmount, dateRange } = useFilteredTransactions(timeRange, currencyCode, selectedMonth, selectedYear);

  const dailySpending = useMemo((): DailySpending[] => {
    const dailyMap = new Map<string, number>();
    const result: DailySpending[] = [];

    const rangeYear = dateRange.startDate.getFullYear();
    const rangeMonth = dateRange.startDate.getMonth();

    if (timeRange === 'week') {
      for (let i = 0; i < 7; i++) {
        const date = new Date(dateRange.startDate);
        date.setDate(date.getDate() + i);
        dailyMap.set(date.toISOString().split('T')[0], 0);
      }
    } else if (timeRange === 'month') {
      const daysInMonth = new Date(rangeYear, rangeMonth + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(rangeYear, rangeMonth, i);
        dailyMap.set(date.toISOString().split('T')[0], 0);
      }
    } else {
      for (let i = 0; i < 12; i++) {
        dailyMap.set(`${rangeYear}-${String(i + 1).padStart(2, '0')}`, 0);
      }
    }

    filteredExpenses.forEach((expense) => {
      const date = new Date(expense.date);
      const key =
        timeRange === 'year'
          ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          : date.toISOString().split('T')[0];
      dailyMap.set(key, (dailyMap.get(key) || 0) + getAmount(expense));
    });

    dailyMap.forEach((amount, dateKey) => {
      let dayLabel: string;
      if (timeRange === 'year') {
        const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;
        dayLabel = t(`analytics.months.${monthKeys[parseInt(dateKey.split('-')[1]) - 1]}`);
      } else if (timeRange === 'week') {
        const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
        dayLabel = t(`analytics.days.${dayKeys[new Date(dateKey).getDay()]}`);
      } else {
        dayLabel = new Date(dateKey).getDate().toString();
      }
      result.push({ date: dateKey, amount, dayLabel });
    });

    return result.sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredExpenses, timeRange, dateRange, t, getAmount]);

  return { dailySpending };
}
