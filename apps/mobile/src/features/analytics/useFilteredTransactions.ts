import { useMemo } from 'react';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useExchangeRateStore, convertAmount } from '@/stores/exchangeRateStore';
import { getStartOfMonth, getEndOfMonth, getStartOfWeek, getEndOfWeek } from '@budget/shared-utils';
import type { TimeRange } from './useAnalytics';

export function useFilteredTransactions(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
) {
  const { expenses } = useExpenseStore();
  const { incomes } = useIncomeStore();
  const { categories } = useCategoryStore();
  const { rates } = useExchangeRateStore();

  const displayCurrency = currencyCode || useExchangeRateStore.getState().baseCurrency || 'USD';

  const toDisplayCurrency = useMemo(
    () => (amount: number, fromCurrency: string) => convertAmount(amount, fromCurrency, displayCurrency, rates),
    [rates, displayCurrency],
  );

  const dateRange = useMemo(() => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    switch (timeRange) {
      case 'week':
        startDate = getStartOfWeek(now);
        endDate = getEndOfWeek(now);
        break;
      case 'month': {
        const m = selectedMonth != null ? selectedMonth - 1 : now.getMonth();
        const y = selectedYear ?? now.getFullYear();
        const target = new Date(y, m, 1);
        startDate = getStartOfMonth(target);
        endDate = getEndOfMonth(target);
        break;
      }
      case 'year': {
        const y = selectedYear ?? now.getFullYear();
        startDate = new Date(y, 0, 1);
        endDate = new Date(y, 11, 31);
        break;
      }
    }

    return { startDate, endDate };
  }, [timeRange, selectedMonth, selectedYear]);

  const filteredExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        if (e.isDeleted) return false;
        if (currencyCode && e.currencyCode !== currencyCode) return false;
        const d = new Date(e.date);
        return d >= dateRange.startDate && d <= dateRange.endDate;
      }),
    [expenses, dateRange, currencyCode],
  );

  const filteredIncomes = useMemo(
    () =>
      incomes.filter((i) => {
        if (i.isDeleted) return false;
        if (currencyCode && i.currencyCode !== currencyCode) return false;
        const d = new Date(i.date);
        return d >= dateRange.startDate && d <= dateRange.endDate;
      }),
    [incomes, dateRange, currencyCode],
  );

  const getAmount = useMemo(
    () => (expense: { amount: number; currencyCode: string }) => toDisplayCurrency(expense.amount, expense.currencyCode),
    [toDisplayCurrency],
  );

  return { expenses, incomes, categories, filteredExpenses, filteredIncomes, getAmount, toDisplayCurrency, dateRange, displayCurrency };
}
