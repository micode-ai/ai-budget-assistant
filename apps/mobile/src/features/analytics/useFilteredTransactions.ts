import { useMemo } from 'react';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useExchangeRateStore, convertAmount } from '@/stores/exchangeRateStore';
import { financialMonth, getStartOfWeek, getEndOfWeek } from '@budget/shared-utils';
import { useFinancialMonth } from '@/hooks/useFinancialMonth';
import { filterConsumption, filterIncomeConsumption } from '@/utils/consumption';
import type { TimeRange } from './useAnalytics';
import { transactionDay } from './localDayKey';

export function useFilteredTransactions(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
) {
  const { expenses: rawExpenses } = useExpenseStore();
  const expenses = useMemo(() => filterConsumption(rawExpenses), [rawExpenses]);
  const { incomes: rawIncomes } = useIncomeStore();
  // Split-receivable incomes are kept out of income totals too (task H1).
  const incomes = useMemo(() => filterIncomeConsumption(rawIncomes), [rawIncomes]);
  const { categories } = useCategoryStore();
  const { rates } = useExchangeRateStore();
  // The account's financial month (salary on the 10th → 10th–9th). Month view
  // only; null = calendar month. Read through the one sanctioned hook.
  const { anchorDay } = useFinancialMonth();

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
        // `selectedMonth` names the month the (financial) period STARTS in —
        // "October" is 10 Oct – 9 Nov for an anchor on the 10th, the same
        // labelling convention as formatFinancialMonth.
        const fallback = financialMonth(now, anchorDay).start;
        const m = selectedMonth != null ? selectedMonth - 1 : fallback.getMonth();
        const y = selectedYear ?? fallback.getFullYear();
        const daysInTarget = new Date(y, m + 1, 0).getDate();
        const insideTarget = new Date(y, m, Math.min(anchorDay ?? 1, daysInTarget), 12);
        ({ start: startDate, end: endDate } = financialMonth(insideTarget, anchorDay));
        break;
      }
      case 'year': {
        const y = selectedYear ?? now.getFullYear();
        startDate = new Date(y, 0, 1);
        // End of the day, not 00:00 — midnight dropped all of 31 December.
        endDate = new Date(y, 11, 31, 23, 59, 59, 999);
        break;
      }
    }

    return { startDate, endDate };
  }, [timeRange, selectedMonth, selectedYear, anchorDay]);

  const filteredExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        if (e.isDeleted) return false;
        if (currencyCode && e.currencyCode !== currencyCode) return false;
        const d = transactionDay(e.date);
        return d >= dateRange.startDate && d <= dateRange.endDate;
      }),
    [expenses, dateRange, currencyCode],
  );

  const filteredIncomes = useMemo(
    () =>
      incomes.filter((i) => {
        if (i.isDeleted) return false;
        if (currencyCode && i.currencyCode !== currencyCode) return false;
        const d = transactionDay(i.date);
        return d >= dateRange.startDate && d <= dateRange.endDate;
      }),
    [incomes, dateRange, currencyCode],
  );

  const getAmount = useMemo(
    () => (expense: { amount: number; currencyCode: string }) => toDisplayCurrency(expense.amount, expense.currencyCode),
    [toDisplayCurrency],
  );

  return { expenses, incomes, categories, filteredExpenses, filteredIncomes, getAmount, toDisplayCurrency, dateRange, displayCurrency, anchorDay };
}
