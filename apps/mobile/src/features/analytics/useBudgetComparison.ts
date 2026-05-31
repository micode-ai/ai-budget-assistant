import { useMemo } from 'react';
import { useBudgetStore } from '@/stores/budgetStore';
import { useFilteredTransactions } from './useFilteredTransactions';
import type { TimeRange, BudgetComparison } from './useAnalytics';

export function useBudgetComparison(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
) {
  const { filteredExpenses } = useFilteredTransactions(timeRange, currencyCode, selectedMonth, selectedYear);

  const budgetComparison = useMemo((): BudgetComparison[] => {
    const allBudgets = useBudgetStore.getState().budgets.filter((b) => b.isActive && !b.isDeleted);
    const filtered = currencyCode ? allBudgets.filter((b) => b.currencyCode === currencyCode) : allBudgets;

    return filtered.map((budget) => {
      const progress = useBudgetStore.getState().getBudgetProgress(budget.id);
      return {
        budgetId: budget.id,
        name: budget.name,
        budgetAmount: budget.amount,
        spent: progress?.spent ?? 0,
        percentageUsed: progress?.percentageUsed ?? 0,
        isOverBudget: progress?.isOverBudget ?? false,
        currencyCode: budget.currencyCode,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredExpenses, currencyCode]);

  return { budgetComparison };
}
