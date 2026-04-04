import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Expense, Income, Category } from '@budget/shared-types';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useExchangeRateStore, convertAmount } from '@/stores/exchangeRateStore';
import { useAuthStore } from '@/stores/authStore';
import { getIntlLocale } from '@/i18n';

export interface CalendarDay {
  date: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  hasExpense: boolean;
  hasIncome: boolean;
}

export interface CategoryBreakdownItem {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  amount: number;
  percentage: number;
}

export interface TransactionItem {
  id: string;
  type: 'expense' | 'income';
  amount: number;
  convertedAmount: number;
  currencyCode: string;
  description: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  date: Date;
}

export interface UseCalendarDataReturn {
  calendarGrid: CalendarDay[][];
  monthLabel: string;
  weekDayLabels: string[];
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  incomeByCategory: CategoryBreakdownItem[];
  expenseByCategory: CategoryBreakdownItem[];
  transactions: TransactionItem[];
  displayCurrency: string;
}

export function useCalendarData(
  selectedMonth: number, // 1-based
  selectedYear: number,
  selectedDay?: number | null,
): UseCalendarDataReturn {
  const { expenses } = useExpenseStore();
  const { incomes } = useIncomeStore();
  const { categories } = useCategoryStore();
  const { rates } = useExchangeRateStore();
  const { user } = useAuthStore();
  const { i18n } = useTranslation();
  const displayCurrency = user?.currencyCode || useExchangeRateStore.getState().baseCurrency || 'USD';
  // Re-derive locale when language changes (i18n.language triggers re-render via useTranslation)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const locale = useMemo(() => getIntlLocale(), [i18n.language]);

  const weekDayLabels = useMemo(() => {
    const labels: string[] = [];
    // Jan 5, 2026 is a Monday
    for (let i = 0; i < 7; i++) {
      const d = new Date(2026, 0, 5 + i);
      labels.push(d.toLocaleDateString(locale, { weekday: 'narrow' }));
    }
    return labels;
  }, [locale]);

  const monthLabel = useMemo(() => {
    const date = new Date(selectedYear, selectedMonth - 1, 1);
    const monthName = date.toLocaleDateString(locale, { month: 'long' });
    return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${selectedYear}`;
  }, [selectedMonth, selectedYear, locale]);

  // Filter expenses and incomes for the selected month
  const monthStart = useMemo(
    () => new Date(selectedYear, selectedMonth - 1, 1),
    [selectedMonth, selectedYear],
  );
  const monthEnd = useMemo(() => {
    const end = new Date(selectedYear, selectedMonth, 0);
    end.setHours(23, 59, 59, 999);
    return end;
  }, [selectedMonth, selectedYear]);

  const monthExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        if (e.isDeleted) return false;
        const d = new Date(e.date);
        return d >= monthStart && d <= monthEnd;
      }),
    [expenses, monthStart, monthEnd],
  );

  const monthIncomes = useMemo(
    () =>
      incomes.filter((inc) => {
        if (inc.isDeleted) return false;
        const d = new Date(inc.date);
        return d >= monthStart && d <= monthEnd;
      }),
    [incomes, monthStart, monthEnd],
  );

  // Build category map for quick lookups
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    for (const cat of categories) {
      map.set(cat.id, cat);
    }
    return map;
  }, [categories]);

  // Calendar grid
  const calendarGrid = useMemo(() => {
    const today = new Date();
    const isCurrentMonthYear =
      today.getMonth() === selectedMonth - 1 && today.getFullYear() === selectedYear;
    const todayDate = today.getDate();

    // Days with expenses/incomes
    const expenseDays = new Set<number>();
    const incomeDays = new Set<number>();
    for (const e of monthExpenses) {
      expenseDays.add(new Date(e.date).getDate());
    }
    for (const inc of monthIncomes) {
      incomeDays.add(new Date(inc.date).getDate());
    }

    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    // Day of week for the 1st: 0=Sun...6=Sat. Convert to Monday-first: Mon=0..Sun=6
    const firstDayOfWeek = new Date(selectedYear, selectedMonth - 1, 1).getDay();
    const mondayOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    // Previous month days to fill
    const prevMonthDays = new Date(selectedYear, selectedMonth - 1, 0).getDate();

    const grid: CalendarDay[][] = [];
    let dayCounter = 1;
    let nextMonthDay = 1;

    for (let row = 0; row < 6; row++) {
      const week: CalendarDay[] = [];
      for (let col = 0; col < 7; col++) {
        const cellIndex = row * 7 + col;
        if (cellIndex < mondayOffset) {
          // Previous month
          const date = prevMonthDays - mondayOffset + cellIndex + 1;
          week.push({ date, isCurrentMonth: false, isToday: false, hasExpense: false, hasIncome: false });
        } else if (dayCounter <= daysInMonth) {
          week.push({
            date: dayCounter,
            isCurrentMonth: true,
            isToday: isCurrentMonthYear && dayCounter === todayDate,
            hasExpense: expenseDays.has(dayCounter),
            hasIncome: incomeDays.has(dayCounter),
          });
          dayCounter++;
        } else {
          // Next month
          week.push({ date: nextMonthDay, isCurrentMonth: false, isToday: false, hasExpense: false, hasIncome: false });
          nextMonthDay++;
        }
      }
      grid.push(week);
      // Stop if all current-month days have been placed
      if (dayCounter > daysInMonth) break;
    }

    return grid;
  }, [selectedMonth, selectedYear, monthExpenses, monthIncomes]);

  // Totals
  const totalIncome = useMemo(
    () =>
      monthIncomes.reduce(
        (sum, inc) => sum + convertAmount(inc.amount, inc.currencyCode, displayCurrency, rates),
        0,
      ),
    [monthIncomes, displayCurrency, rates],
  );

  const totalExpenses = useMemo(
    () =>
      monthExpenses.reduce(
        (sum, e) => sum + convertAmount(e.amount, e.currencyCode, displayCurrency, rates),
        0,
      ),
    [monthExpenses, displayCurrency, rates],
  );

  const netProfit = totalIncome - totalExpenses;

  // Category breakdowns
  const incomeByCategory = useMemo(() => {
    if (totalIncome === 0) return [];
    const map = new Map<string, number>();
    for (const inc of monthIncomes) {
      const catId = inc.categoryId || 'uncategorized';
      const converted = convertAmount(inc.amount, inc.currencyCode, displayCurrency, rates);
      map.set(catId, (map.get(catId) || 0) + converted);
    }
    return Array.from(map.entries())
      .map(([catId, amount]) => {
        const cat = categoryMap.get(catId);
        return {
          categoryId: catId,
          name: cat?.name || 'Uncategorized',
          icon: cat?.icon || 'ellipsis-horizontal',
          color: cat?.color || '#95A5A6',
          amount,
          percentage: totalIncome > 0 ? Math.round((amount / totalIncome) * 100) : 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [monthIncomes, totalIncome, displayCurrency, rates, categoryMap]);

  const expenseByCategory = useMemo(() => {
    if (totalExpenses === 0) return [];
    const map = new Map<string, number>();
    for (const e of monthExpenses) {
      const catId = e.categoryId || 'uncategorized';
      const converted = convertAmount(e.amount, e.currencyCode, displayCurrency, rates);
      map.set(catId, (map.get(catId) || 0) + converted);
    }
    return Array.from(map.entries())
      .map(([catId, amount]) => {
        const cat = categoryMap.get(catId);
        return {
          categoryId: catId,
          name: cat?.name || 'Uncategorized',
          icon: cat?.icon || 'ellipsis-horizontal',
          color: cat?.color || '#95A5A6',
          amount,
          percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [monthExpenses, totalExpenses, displayCurrency, rates, categoryMap]);

  // Transactions list (filtered by selectedDay if set)
  const transactions = useMemo(() => {
    const filterDay = selectedDay ?? null;

    const mapExpense = (e: Expense): TransactionItem => {
      const cat = categoryMap.get(e.categoryId || '');
      return {
        id: e.id,
        type: 'expense',
        amount: e.amount,
        convertedAmount: convertAmount(e.amount, e.currencyCode, displayCurrency, rates),
        currencyCode: e.currencyCode,
        description: e.description || cat?.name || 'Expense',
        categoryName: cat?.name || 'Uncategorized',
        categoryIcon: cat?.icon || 'ellipsis-horizontal',
        categoryColor: cat?.color || '#95A5A6',
        date: new Date(e.date),
      };
    };

    const mapIncome = (inc: Income): TransactionItem => {
      const cat = categoryMap.get(inc.categoryId || '');
      return {
        id: inc.id,
        type: 'income',
        amount: inc.amount,
        convertedAmount: convertAmount(inc.amount, inc.currencyCode, displayCurrency, rates),
        currencyCode: inc.currencyCode,
        description: inc.description || cat?.name || 'Income',
        categoryName: cat?.name || 'Uncategorized',
        categoryIcon: cat?.icon || 'ellipsis-horizontal',
        categoryColor: cat?.color || '#95A5A6',
        date: new Date(inc.date),
      };
    };

    let filteredExpenses = monthExpenses;
    let filteredIncomes = monthIncomes;

    if (filterDay !== null) {
      filteredExpenses = monthExpenses.filter((e) => new Date(e.date).getDate() === filterDay);
      filteredIncomes = monthIncomes.filter((inc) => new Date(inc.date).getDate() === filterDay);
    }

    const items: TransactionItem[] = [
      ...filteredExpenses.map(mapExpense),
      ...filteredIncomes.map(mapIncome),
    ];

    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [monthExpenses, monthIncomes, selectedDay, displayCurrency, rates, categoryMap]);

  return {
    calendarGrid,
    monthLabel,
    weekDayLabels,
    totalIncome,
    totalExpenses,
    netProfit,
    incomeByCategory,
    expenseByCategory,
    transactions,
    displayCurrency,
  };
}
