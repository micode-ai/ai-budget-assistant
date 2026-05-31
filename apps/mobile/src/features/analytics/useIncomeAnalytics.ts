import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFilteredTransactions } from './useFilteredTransactions';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import type { TimeRange, IncomeCategorySpending } from './useAnalytics';

const INCOME_CATEGORY_COLORS = [
  '#10B981', '#34D399', '#059669', '#6EE7B7', '#14B8A6',
  '#2DD4BF', '#0D9488', '#22D3EE', '#0EA5E9', '#6366F1',
];

export function useIncomeAnalytics(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
) {
  const { t } = useTranslation();
  const { filteredIncomes, categories, toDisplayCurrency } = useFilteredTransactions(timeRange, currencyCode, selectedMonth, selectedYear);

  const incomeByCategory = useMemo((): IncomeCategorySpending[] => {
    const total = filteredIncomes.reduce((sum, i) => sum + toDisplayCurrency(i.amount, i.currencyCode), 0);
    if (total === 0) return [];

    const categoryMap = new Map<string | null, number>();
    for (const income of filteredIncomes) {
      const key = income.categoryId || null;
      categoryMap.set(key, (categoryMap.get(key) || 0) + toDisplayCurrency(income.amount, income.currencyCode));
    }

    const result: IncomeCategorySpending[] = [];
    let colorIndex = 0;
    for (const [categoryId, amount] of categoryMap) {
      const category = categoryId
        ? categories.find((c) => c.id === categoryId) || categories.find((c) => c.name === categoryId)
        : undefined;
      result.push({
        categoryId,
        name: category ? getCategoryDisplayName(category, t) : t('analytics.incomeCategoryOther'),
        amount,
        percentage: (amount / total) * 100,
        color: INCOME_CATEGORY_COLORS[colorIndex % INCOME_CATEGORY_COLORS.length],
      });
      colorIndex++;
    }

    return result.sort((a, b) => b.amount - a.amount);
  }, [filteredIncomes, categories, t, toDisplayCurrency]);

  return { incomeByCategory };
}
