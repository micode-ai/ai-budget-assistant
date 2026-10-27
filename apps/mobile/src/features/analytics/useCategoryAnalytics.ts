import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFilteredTransactions } from './useFilteredTransactions';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { categoryLabel } from '@/utils/entityLabel';
import { buildParentOf, normalizeCategoryKeys } from './buildParentOf';
import { rollUpCategoryTotals } from './categoryRollup';
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

    // Legacy name-keyed spend is re-keyed to its category id first (current and
    // trailing alike), so a parent's old name-keyed rows merge into its node
    // instead of showing as a second top-level slice with the same label.
    const nodes = rollUpCategoryTotals(
      normalizeCategoryKeys(categoryMap, categories),
      trailingMonthMaps.map((map) => normalizeCategoryKeys(map, categories)),
      buildParentOf(categories),
    );
    const findCategory = (id: string | null) =>
      id ? categories.find((c) => c.id === id) || categories.find((c) => c.name === id) : undefined;
    const vsAverage = (amount: number, trailing: number[]) =>
      timeRange === 'month' ? computeVsAverage(amount, trailing) : null;

    return nodes.map((node, colorIndex): CategorySpending => {
      const category = findCategory(node.categoryId);
      const color = category?.color || CATEGORY_COLORS[colorIndex % CATEGORY_COLORS.length];
      const name = category ? getCategoryDisplayName(category, t) : categoryLabel(category);
      const children: CategorySpending[] = node.children.map((child) => {
        const childCategory = findCategory(child.categoryId);
        return {
          categoryId: child.categoryId,
          name: child.isParentSelf
            ? t('analytics.parentNoSubcategory', { name })
            : childCategory
              ? getCategoryDisplayName(childCategory, t)
              : categoryLabel(childCategory),
          amount: child.amount,
          percentage: node.amount > 0 ? (child.amount / node.amount) * 100 : 0,
          color: child.isParentSelf ? color : childCategory?.color || color,
          vsAverage: vsAverage(child.amount, child.trailing),
          isParentSelf: child.isParentSelf || undefined,
        };
      });
      return {
        categoryId: node.categoryId,
        name,
        amount: node.amount,
        percentage: (node.amount / total) * 100,
        color,
        vsAverage: vsAverage(node.amount, node.trailing),
        ...(children.length > 0 ? { children } : {}),
      };
    });
  }, [filteredExpenses, expenses, categories, t, getAmount, toDisplayCurrency, timeRange, dateRange, currencyCode]);

  return { categorySpending };
}
