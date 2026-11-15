import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFilteredTransactions } from './useFilteredTransactions';
import { categoryLabel } from '@/utils/entityLabel';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { buildParentOf, normalizeCategoryKeys } from './buildParentOf';
import { rollUpCategoryTotals } from './categoryRollup';
import { groupExpensesByCategory, computeVsAverage } from './categoryGrouping';
import { elapsedDays, inWindow, trailingMonthWindows } from './periodWindows';
import type { TimeRange, AnalyticsSummary } from './useAnalytics';

const TRAILING_MONTHS = 3;

export function useSummaryAnalytics(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
) {
  const { t } = useTranslation();
  const { expenses, filteredExpenses, categories, getAmount, toDisplayCurrency, dateRange } =
    useFilteredTransactions(timeRange, currencyCode, selectedMonth, selectedYear);

  const summary = useMemo((): AnalyticsSummary => {
    const totalSpent = filteredExpenses.reduce((sum, e) => sum + getAmount(e), 0);
    const totalDiscountSavings = filteredExpenses.reduce(
      (sum, e) => sum + toDisplayCurrency(e.discountAmount || 0, e.currencyCode),
      0,
    );
    const totalDepositsPaid = filteredExpenses.reduce(
      (sum, e) => sum + toDisplayCurrency(e.depositAmount || 0, e.currencyCode),
      0,
    );
    const transactionCount = filteredExpenses.length;

    // Divide by the days that have HAPPENED: on the 5th, five days of spending
    // over the month's 30 read as a fifth of the real daily rate, and the
    // "keep daily spending under" tip built on it was a fifth too.
    const days = elapsedDays(dateRange);
    const averagePerDay = days > 0 ? totalSpent / days : 0;

    const dailyTotals = new Map<string, number>();
    filteredExpenses.forEach((e) => {
      const dateKey = new Date(e.date).toISOString().split('T')[0];
      dailyTotals.set(dateKey, (dailyTotals.get(dateKey) || 0) + getAmount(e));
    });

    let highestSpendingDay: string | null = null;
    let highestAmount = 0;
    dailyTotals.forEach((amount, date) => {
      if (amount > highestAmount) {
        highestAmount = amount;
        highestSpendingDay = date;
      }
    });

    // Top category through the SAME splits-aware, parent-rolled grouping as the
    // category donut beside it — otherwise a split receipt counted whole under
    // its own category here, and the two named different winners.
    const nodes = rollUpCategoryTotals(
      normalizeCategoryKeys(groupExpensesByCategory(filteredExpenses, toDisplayCurrency), categories),
      [],
      buildParentOf(categories),
    );
    let mostExpensiveCategory: string | null = null;
    let topAmount = 0;
    for (const node of nodes) {
      if (node.amount > topAmount) {
        topAmount = node.amount;
        const cat = node.categoryId
          ? categories.find((c) => c.id === node.categoryId) || categories.find((c) => c.name === node.categoryId)
          : undefined;
        mostExpensiveCategory = (cat ? getCategoryDisplayName(cat, t) : categoryLabel(cat)) || null;
      }
    }

    // "vs 3-month average" is a monthly figure: a week or a year against an
    // average MONTH is meaningless, so it is only computed for the month view
    // (0 hides the line). Same currency filter and same-days windows as the
    // current total, so like is compared with like.
    let vsAverage = 0;
    if (timeRange === 'month') {
      const monthlyTotals = trailingMonthWindows(dateRange, TRAILING_MONTHS).map((w) =>
        expenses
          .filter((e) => {
            if (e.isDeleted) return false;
            if (currencyCode && e.currencyCode !== currencyCode) return false;
            return inWindow(new Date(e.date), w);
          })
          .reduce((s, e) => s + toDisplayCurrency(e.amount, e.currencyCode), 0),
      );
      vsAverage = computeVsAverage(totalSpent, monthlyTotals) ?? 0;
    }

    return {
      totalSpent,
      totalDiscountSavings,
      totalDepositsPaid,
      averagePerDay,
      transactionCount,
      trend: 0,
      vsAverage,
      highestSpendingDay,
      mostExpensiveCategory,
    };
  }, [filteredExpenses, expenses, categories, dateRange, timeRange, currencyCode, getAmount, toDisplayCurrency, t]);

  return { summary };
}
