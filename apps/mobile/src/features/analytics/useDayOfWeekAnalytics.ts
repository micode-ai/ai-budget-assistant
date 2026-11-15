import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFilteredTransactions } from './useFilteredTransactions';
import type { TimeRange, DayOfWeekSpending } from './useAnalytics';
import { transactionDay } from './localDayKey';

export function useDayOfWeekAnalytics(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
) {
  const { t } = useTranslation();
  const { filteredExpenses, getAmount } = useFilteredTransactions(timeRange, currencyCode, selectedMonth, selectedYear);

  const dayOfWeekSpending = useMemo((): DayOfWeekSpending[] => {
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
    const days: DayOfWeekSpending[] = dayKeys.map((key, index) => ({
      dayIndex: index,
      dayLabel: t(`analytics.days.${key}`),
      totalAmount: 0,
      transactionCount: 0,
    }));

    filteredExpenses.forEach((expense) => {
      const dayIndex = transactionDay(expense.date).getDay();
      days[dayIndex].totalAmount += getAmount(expense);
      days[dayIndex].transactionCount += 1;
    });

    // Reorder Mon–Sun
    return [...days.slice(1), days[0]];
  }, [filteredExpenses, t, getAmount]);

  return { dayOfWeekSpending };
}
