import { useMemo } from 'react';
import { useFilteredTransactions } from './useFilteredTransactions';
import type { TimeRange, AnalyticsSummary } from './useAnalytics';

export function useSummaryAnalytics(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
) {
  const { expenses, filteredExpenses, categories, getAmount, toDisplayCurrency, dateRange } =
    useFilteredTransactions(timeRange, currencyCode, selectedMonth, selectedYear);

  const summary = useMemo((): AnalyticsSummary => {
    const totalSpent = filteredExpenses.reduce((sum, e) => sum + getAmount(e), 0);
    const totalDiscountSavings = filteredExpenses.reduce(
      (sum, e) => sum + toDisplayCurrency(e.discountAmount || 0, e.currencyCode),
      0,
    );
    const transactionCount = filteredExpenses.length;

    const msPerDay = 24 * 60 * 60 * 1000;
    const daysInRange = Math.ceil((dateRange.endDate.getTime() - dateRange.startDate.getTime()) / msPerDay);
    const averagePerDay = daysInRange > 0 ? totalSpent / daysInRange : 0;

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

    // Find top category (inline, avoids cross-hook dependency)
    const categoryTotals = new Map<string | null, { name: string; amount: number }>();
    filteredExpenses.forEach((e) => {
      const key = e.categoryId || null;
      const cat = key ? categories.find((c) => c.id === key) : undefined;
      const name = cat?.name || (key ?? '');
      const existing = categoryTotals.get(key);
      categoryTotals.set(key, { name, amount: (existing?.amount ?? 0) + getAmount(e) });
    });
    let mostExpensiveCategory: string | null = null;
    let topAmount = 0;
    categoryTotals.forEach(({ name, amount }) => {
      if (amount > topAmount) { topAmount = amount; mostExpensiveCategory = name || null; }
    });

    const trailingMonths = 3;
    const monthlyTotals: number[] = [];
    for (let i = 1; i <= trailingMonths; i++) {
      const d = new Date(dateRange.startDate.getFullYear(), dateRange.startDate.getMonth() - i, 1);
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const monthTotal = expenses
        .filter((e) => {
          if (e.isDeleted) return false;
          const ed = new Date(e.date);
          return ed >= monthStart && ed < monthEnd;
        })
        .reduce((s, e) => s + toDisplayCurrency(e.amount, e.currencyCode), 0);
      monthlyTotals.push(monthTotal);
    }

    let vsAverage = 0;
    if (monthlyTotals.some((t) => t > 0)) {
      const rollingAverage = monthlyTotals.reduce((s, t) => s + t, 0) / monthlyTotals.length;
      vsAverage =
        rollingAverage === 0
          ? totalSpent > 0 ? 100 : 0
          : Math.round(((totalSpent - rollingAverage) / rollingAverage) * 10000) / 100;
    }

    return {
      totalSpent,
      totalDiscountSavings,
      averagePerDay,
      transactionCount,
      trend: 0,
      vsAverage,
      highestSpendingDay,
      mostExpensiveCategory,
    };
  }, [filteredExpenses, expenses, categories, dateRange, getAmount, toDisplayCurrency]);

  return { summary };
}
