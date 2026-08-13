import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFilteredTransactions } from './useFilteredTransactions';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { groupExpensesByCategory, computeVsAverage } from './categoryGrouping';
import type { TimeRange, CategorySpending } from './useAnalytics';

// Re-exported so existing/expected import paths (`from './useCategoryAnalytics'`)
// keep working — the implementation lives in `./categoryGrouping`, a module
// with no store imports, so it can be unit-tested without pulling in the
// store-import graph this hook itself depends on (see that file's tests).
export { groupExpensesByCategory, computeVsAverage };
export type { SplittableExpense } from './categoryGrouping';

const CATEGORY_COLORS = [
  '#4ECDC4', '#FF6B6B', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
];

const TRAILING_MONTHS = 3;

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

    // An expense with category splits contributes each split's own converted
    // amount to its own category; an expense with no splits contributes its
    // whole amount to `categoryId`, exactly as before splits existed.
    const categoryMap = groupExpensesByCategory(filteredExpenses, toDisplayCurrency);

    // Precompute each trailing month's full category map ONCE, through the
    // exact same splits-aware grouping rule as the current period above —
    // otherwise a split category's trailing total would read the FULL
    // pre-split receipt amount while its current total reads only its own
    // share, reporting a fabricated swing instead of comparing like with like.
    const trailingMonthMaps: Map<string | null, number>[] =
      timeRange === 'month'
        ? Array.from({ length: TRAILING_MONTHS }, (_, idx) => {
            const i = idx + 1;
            const d = new Date(dateRange.startDate.getFullYear(), dateRange.startDate.getMonth() - i, 1);
            const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
            const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
            const monthExpenses = expenses.filter((e) => {
              if (e.isDeleted) return false;
              if (currencyCode && e.currencyCode !== currencyCode) return false;
              const ed = new Date(e.date);
              return ed >= monthStart && ed < monthEnd;
            });
            return groupExpensesByCategory(monthExpenses, toDisplayCurrency);
          })
        : [];

    const getCategoryVsAverage = (categoryId: string | null, currentAmount: number): number | null => {
      if (timeRange !== 'month') return null;
      const monthlyTotals = trailingMonthMaps.map((m) => m.get(categoryId) || 0);
      return computeVsAverage(currentAmount, monthlyTotals);
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
