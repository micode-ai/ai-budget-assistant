import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFilteredTransactions } from './useFilteredTransactions';
import { localDayKey } from './localDayKey';
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

    if (timeRange !== 'year') {
      // Every LOCAL day of the range — a financial month (10 Oct – 9 Nov)
      // spans two calendar months, and a `toISOString()` key would shift each
      // day by one in any zone east of UTC.
      const s = dateRange.startDate;
      for (let i = 0; ; i++) {
        const date = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i);
        if (date > dateRange.endDate) break;
        dailyMap.set(localDayKey(date), 0);
      }
    } else {
      for (let i = 0; i < 12; i++) {
        dailyMap.set(`${rangeYear}-${String(i + 1).padStart(2, '0')}`, 0);
      }
    }

    filteredExpenses.forEach((expense) => {
      const dayKey = localDayKey(expense.date);
      const key = timeRange === 'year' ? dayKey.slice(0, 7) : dayKey;
      dailyMap.set(key, (dailyMap.get(key) || 0) + getAmount(expense));
    });

    dailyMap.forEach((amount, dateKey) => {
      let dayLabel: string;
      if (timeRange === 'year') {
        const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;
        dayLabel = t(`analytics.months.${monthKeys[parseInt(dateKey.split('-')[1]) - 1]}`);
      } else if (timeRange === 'week') {
        const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
        const [y, m, d] = dateKey.split('-').map(Number);
        dayLabel = t(`analytics.days.${dayKeys[new Date(y, m - 1, d).getDay()]}`);
      } else {
        dayLabel = String(Number(dateKey.slice(8, 10)));
      }
      result.push({ date: dateKey, amount, dayLabel });
    });

    return result.sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredExpenses, timeRange, dateRange, t, getAmount]);

  return { dailySpending };
}
