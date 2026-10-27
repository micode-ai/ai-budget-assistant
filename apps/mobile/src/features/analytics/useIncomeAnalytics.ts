import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFilteredTransactions } from './useFilteredTransactions';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { buildParentOf } from './buildParentOf';
import { rollUpCategoryTotals } from './categoryRollup';
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

    const nodes = rollUpCategoryTotals(categoryMap, [], buildParentOf(categories));
    const findCategory = (id: string | null) =>
      id ? categories.find((c) => c.id === id) || categories.find((c) => c.name === id) : undefined;
    const otherLabel = t('analytics.incomeCategoryOther');

    return nodes.map((node, colorIndex): IncomeCategorySpending => {
      const category = findCategory(node.categoryId);
      const color = INCOME_CATEGORY_COLORS[colorIndex % INCOME_CATEGORY_COLORS.length];
      const name = category ? getCategoryDisplayName(category, t) : otherLabel;
      const children: IncomeCategorySpending[] = node.children.map((child) => {
        const childCategory = findCategory(child.categoryId);
        return {
          categoryId: child.categoryId,
          name: child.isParentSelf
            ? t('analytics.parentNoSubcategory', { name })
            : childCategory
              ? getCategoryDisplayName(childCategory, t)
              : otherLabel,
          amount: child.amount,
          percentage: node.amount > 0 ? (child.amount / node.amount) * 100 : 0,
          color: child.isParentSelf ? color : childCategory?.color || color,
          isParentSelf: child.isParentSelf || undefined,
        };
      });
      return {
        categoryId: node.categoryId,
        name,
        amount: node.amount,
        percentage: (node.amount / total) * 100,
        color,
        ...(children.length > 0 ? { children } : {}),
      };
    });
  }, [filteredIncomes, categories, t, toDisplayCurrency]);

  return { incomeByCategory };
}
