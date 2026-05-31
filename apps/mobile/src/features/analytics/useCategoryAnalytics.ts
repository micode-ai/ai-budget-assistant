import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFilteredTransactions } from './useFilteredTransactions';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import type { TimeRange, CategorySpending } from './useAnalytics';

const CATEGORY_COLORS = [
  '#4ECDC4', '#FF6B6B', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
];

export function useCategoryAnalytics(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
) {
  const { t } = useTranslation();
  const { expenses, filteredExpenses, categories, getAmount, toDisplayCurrency, dateRange } =
    useFilteredTransactions(timeRange, currencyCode, selectedMonth, selectedYear);

  const categorySpending = useMemo((): CategorySpending[] => {
    const total = filteredExpenses.reduce((sum, e) => sum + getAmount(e), 0);
    if (total === 0) return [];

    const categoryMap = new Map<string | null, number>();
    filteredExpenses.forEach((expense) => {
      const key = expense.categoryId || null;
      categoryMap.set(key, (categoryMap.get(key) || 0) + getAmount(expense));
    });

    const trailingMonths = 3;
    const getCategoryVsAverage = (categoryId: string | null, currentAmount: number): number | null => {
      if (timeRange !== 'month') return null;
      const monthlyTotals: number[] = [];
      for (let i = 1; i <= trailingMonths; i++) {
        const d = new Date(dateRange.startDate.getFullYear(), dateRange.startDate.getMonth() - i, 1);
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const monthTotal = expenses
          .filter((e) => {
            if (e.isDeleted) return false;
            if (currencyCode && e.currencyCode !== currencyCode) return false;
            if ((e.categoryId || null) !== categoryId) return false;
            const ed = new Date(e.date);
            return ed >= monthStart && ed < monthEnd;
          })
          .reduce((s, e) => s + toDisplayCurrency(e.amount, e.currencyCode), 0);
        monthlyTotals.push(monthTotal);
      }
      if (!monthlyTotals.some((t) => t > 0)) return null;
      const rollingAverage = monthlyTotals.reduce((s, t) => s + t, 0) / trailingMonths;
      if (rollingAverage === 0) return currentAmount > 0 ? 100 : 0;
      return Math.round(((currentAmount - rollingAverage) / rollingAverage) * 10000) / 100;
    };

    const result: CategorySpending[] = [];
    let colorIndex = 0;
    categoryMap.forEach((amount, categoryId) => {
      const category = categoryId
        ? categories.find((c) => c.id === categoryId) || categories.find((c) => c.name === categoryId)
        : undefined;
      result.push({
        categoryId,
        name: category ? getCategoryDisplayName(category, t) : (categoryId ? categoryId : t('common.uncategorized')),
        amount,
        percentage: (amount / total) * 100,
        color: category?.color || CATEGORY_COLORS[colorIndex % CATEGORY_COLORS.length],
        vsAverage: getCategoryVsAverage(categoryId, amount),
      });
      colorIndex++;
    });

    return result.sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses, expenses, categories, t, getAmount, toDisplayCurrency, timeRange, dateRange, currencyCode]);

  return { categorySpending };
}
