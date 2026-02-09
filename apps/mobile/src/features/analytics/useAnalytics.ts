import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { loadItemsByExpenseId } from '@/db/expenseItemRepository';
import { getStartOfMonth, getEndOfMonth, getStartOfWeek, getEndOfWeek } from '@budget/shared-utils';
import { api } from '@/services/api';
import type { Currency } from '@budget/shared-types';

export type TimeRange = 'week' | 'month' | 'year';

export interface DailySpending {
  date: string;
  amount: number;
  dayLabel: string;
}

export interface CategorySpending {
  categoryId: string | null;
  name: string;
  amount: number;
  percentage: number;
  color: string;
}

export interface AnalyticsSummary {
  totalSpent: number;
  totalDiscountSavings: number;
  averagePerDay: number;
  transactionCount: number;
  trend: number;
  highestSpendingDay: string | null;
  mostExpensiveCategory: string | null;
}

export interface ItemBreakdown {
  description: string;
  totalSpent: number;
  count: number;
  avgPrice: number;
}

export interface BudgetComparison {
  budgetId: string;
  name: string;
  budgetAmount: number;
  spent: number;
  percentageUsed: number;
  isOverBudget: boolean;
  currencyCode: Currency;
}

export interface DayOfWeekSpending {
  dayIndex: number;
  dayLabel: string;
  totalAmount: number;
  transactionCount: number;
}

export interface PeriodComparison {
  currentTotal: number;
  previousTotal: number;
  changePercent: number;
}

export interface SpendingAnomalyItem {
  categoryId: string;
  categoryName: string;
  currentAmount: number;
  averageAmount: number;
  percentageChange: number;
  period: string;
}

export interface BudgetPredictionItem {
  budgetId: string;
  budgetName: string;
  estimatedExhaustionDate?: string;
  dailyBurnRate: number;
  daysRemaining: number;
  projectedTotal: number;
  currencyCode: string;
}

const CATEGORY_COLORS = [
  '#4ECDC4', // Teal
  '#FF6B6B', // Red
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
  '#BB8FCE', // Purple
  '#85C1E9', // Light Blue
];

export function useAnalytics(timeRange: TimeRange = 'month', currencyCode?: string) {
  const { t } = useTranslation();
  const { expenses } = useExpenseStore();
  const [isLoading, setIsLoading] = useState(false);

  const dateRange = useMemo(() => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    switch (timeRange) {
      case 'week':
        startDate = getStartOfWeek(now);
        endDate = getEndOfWeek(now);
        break;
      case 'month':
        startDate = getStartOfMonth(now);
        endDate = getEndOfMonth(now);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        break;
    }

    return { startDate, endDate };
  }, [timeRange]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (e.isDeleted) return false;
      if (currencyCode && e.currencyCode !== currencyCode) return false;
      const expenseDate = new Date(e.date);
      return expenseDate >= dateRange.startDate && expenseDate <= dateRange.endDate;
    });
  }, [expenses, dateRange, currencyCode]);

  const dailySpending = useMemo((): DailySpending[] => {
    const now = new Date();
    const dailyMap = new Map<string, number>();
    const result: DailySpending[] = [];

    // Initialize days based on time range
    if (timeRange === 'week') {
      for (let i = 0; i < 7; i++) {
        const date = new Date(dateRange.startDate);
        date.setDate(date.getDate() + i);
        const dateKey = date.toISOString().split('T')[0];
        dailyMap.set(dateKey, 0);
      }
    } else if (timeRange === 'month') {
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(now.getFullYear(), now.getMonth(), i);
        const dateKey = date.toISOString().split('T')[0];
        dailyMap.set(dateKey, 0);
      }
    } else {
      // Year - show monthly totals
      for (let i = 0; i < 12; i++) {
        const monthKey = `${now.getFullYear()}-${String(i + 1).padStart(2, '0')}`;
        dailyMap.set(monthKey, 0);
      }
    }

    // Aggregate expenses
    filteredExpenses.forEach((expense) => {
      const date = new Date(expense.date);
      let key: string;

      if (timeRange === 'year') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else {
        key = date.toISOString().split('T')[0];
      }

      const current = dailyMap.get(key) || 0;
      dailyMap.set(key, current + expense.amount);
    });

    // Convert to array
    dailyMap.forEach((amount, dateKey) => {
      let dayLabel: string;

      if (timeRange === 'year') {
        const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;
        const monthIndex = parseInt(dateKey.split('-')[1]) - 1;
        dayLabel = t(`analytics.months.${monthKeys[monthIndex]}`);
      } else if (timeRange === 'week') {
        const date = new Date(dateKey);
        const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
        dayLabel = t(`analytics.days.${dayKeys[date.getDay()]}`);
      } else {
        const date = new Date(dateKey);
        dayLabel = date.getDate().toString();
      }

      result.push({ date: dateKey, amount, dayLabel });
    });

    return result.sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredExpenses, timeRange, dateRange, t]);

  const categorySpending = useMemo((): CategorySpending[] => {
    const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    if (total === 0) return [];

    const categoryMap = new Map<string | null, number>();

    filteredExpenses.forEach((expense) => {
      const key = expense.categoryId || null;
      const current = categoryMap.get(key) || 0;
      categoryMap.set(key, current + expense.amount);
    });

    const result: CategorySpending[] = [];
    let colorIndex = 0;

    categoryMap.forEach((amount, categoryId) => {
      result.push({
        categoryId,
        name: categoryId || t('common.uncategorized'),
        amount,
        percentage: (amount / total) * 100,
        color: CATEGORY_COLORS[colorIndex % CATEGORY_COLORS.length],
      });
      colorIndex++;
    });

    return result.sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses, t]);

  const summary = useMemo((): AnalyticsSummary => {
    const totalSpent = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalDiscountSavings = filteredExpenses.reduce((sum, e) => sum + (e.discountAmount || 0), 0);
    const transactionCount = filteredExpenses.length;

    // Calculate days in range
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysInRange = Math.ceil(
      (dateRange.endDate.getTime() - dateRange.startDate.getTime()) / msPerDay,
    );
    const averagePerDay = daysInRange > 0 ? totalSpent / daysInRange : 0;

    // Find highest spending day
    const dailyTotals = new Map<string, number>();
    filteredExpenses.forEach((e) => {
      const dateKey = new Date(e.date).toISOString().split('T')[0];
      dailyTotals.set(dateKey, (dailyTotals.get(dateKey) || 0) + e.amount);
    });

    let highestSpendingDay: string | null = null;
    let highestAmount = 0;
    dailyTotals.forEach((amount, date) => {
      if (amount > highestAmount) {
        highestAmount = amount;
        highestSpendingDay = date;
      }
    });

    // Find most expensive category
    const topCategory = categorySpending[0];
    const mostExpensiveCategory = topCategory?.name || null;

    // Calculate trend (simplified - comparing to previous period)
    const trend = 0; // Would need previous period data

    return {
      totalSpent,
      totalDiscountSavings,
      averagePerDay,
      transactionCount,
      trend,
      highestSpendingDay,
      mostExpensiveCategory,
    };
  }, [filteredExpenses, dateRange, categorySpending]);

  // Budget comparison
  const budgetComparison = useMemo((): BudgetComparison[] => {
    const allBudgets = useBudgetStore.getState().budgets.filter((b) => b.isActive && !b.isDeleted);
    const filtered = currencyCode
      ? allBudgets.filter((b) => b.currencyCode === currencyCode)
      : allBudgets;

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
  }, [filteredExpenses, currencyCode]);

  // Day of week spending
  const dayOfWeekSpending = useMemo((): DayOfWeekSpending[] => {
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
    const days: DayOfWeekSpending[] = dayKeys.map((key, index) => ({
      dayIndex: index,
      dayLabel: t(`analytics.days.${key}`),
      totalAmount: 0,
      transactionCount: 0,
    }));

    filteredExpenses.forEach((expense) => {
      const dayIndex = new Date(expense.date).getDay();
      days[dayIndex].totalAmount += expense.amount;
      days[dayIndex].transactionCount += 1;
    });

    // Reorder: Mon-Sun instead of Sun-Sat
    return [...days.slice(1), days[0]];
  }, [filteredExpenses, t]);

  // Period comparison
  const periodComparison = useMemo((): PeriodComparison => {
    const currentTotal = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Calculate previous period range
    const msRange = dateRange.endDate.getTime() - dateRange.startDate.getTime();
    const prevStart = new Date(dateRange.startDate.getTime() - msRange);
    const prevEnd = new Date(dateRange.startDate.getTime() - 1);

    const previousTotal = expenses
      .filter((e) => {
        if (e.isDeleted) return false;
        if (currencyCode && e.currencyCode !== currencyCode) return false;
        const d = new Date(e.date);
        return d >= prevStart && d <= prevEnd;
      })
      .reduce((sum, e) => sum + e.amount, 0);

    const changePercent =
      previousTotal > 0
        ? ((currentTotal - previousTotal) / previousTotal) * 100
        : currentTotal > 0
          ? 100
          : 0;

    return { currentTotal, previousTotal, changePercent };
  }, [filteredExpenses, expenses, dateRange, currencyCode]);

  // Predictive insights from API
  const [anomalies, setAnomalies] = useState<SpendingAnomalyItem[]>([]);
  const [predictions, setPredictions] = useState<BudgetPredictionItem[]>([]);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        const data = await api.getInsights();
        setAnomalies(data.anomalies || []);
        setPredictions(data.predictions || []);
      } catch {
        // Fallback: compute anomalies locally from expense data
        const localAnomalies: SpendingAnomalyItem[] = [];
        const currentByCategory = new Map<string, { amount: number; name: string }>();

        for (const expense of filteredExpenses) {
          const catId = expense.categoryId || 'uncategorized';
          const current = currentByCategory.get(catId) || { amount: 0, name: catId };
          currentByCategory.set(catId, {
            amount: current.amount + expense.amount,
            name: current.name,
          });
        }

        // Compare to previous period
        const msRange = dateRange.endDate.getTime() - dateRange.startDate.getTime();
        const prevStart = new Date(dateRange.startDate.getTime() - msRange);
        const prevEnd = new Date(dateRange.startDate.getTime() - 1);

        const prevExpenses = expenses.filter((e) => {
          if (e.isDeleted) return false;
          if (currencyCode && e.currencyCode !== currencyCode) return false;
          const d = new Date(e.date);
          return d >= prevStart && d <= prevEnd;
        });

        const prevByCategory = new Map<string, number>();
        for (const expense of prevExpenses) {
          const catId = expense.categoryId || 'uncategorized';
          prevByCategory.set(catId, (prevByCategory.get(catId) || 0) + expense.amount);
        }

        for (const [catId, currentData] of currentByCategory) {
          const prevAmount = prevByCategory.get(catId);
          if (!prevAmount || prevAmount <= 0) continue;
          const pctChange = ((currentData.amount - prevAmount) / prevAmount) * 100;
          if (pctChange >= 30) {
            localAnomalies.push({
              categoryId: catId,
              categoryName: currentData.name,
              currentAmount: currentData.amount,
              averageAmount: prevAmount,
              percentageChange: Math.round(pctChange),
              period: dateRange.startDate.toISOString().slice(0, 7),
            });
          }
        }

        setAnomalies(localAnomalies.sort((a, b) => b.percentageChange - a.percentageChange));
        setPredictions([]);
      }
    };

    fetchInsights();
  }, [filteredExpenses, dateRange, currencyCode, expenses]);

  // Item breakdown for OCR expenses
  const [itemBreakdown, setItemBreakdown] = useState<ItemBreakdown[]>([]);

  useEffect(() => {
    const computeItemBreakdown = async () => {
      const ocrExpenses = filteredExpenses.filter((e) => e.source === 'ocr');
      if (ocrExpenses.length === 0) {
        setItemBreakdown([]);
        return;
      }

      const itemMap = new Map<string, { totalSpent: number; count: number }>();

      for (const expense of ocrExpenses) {
        try {
          const items = await loadItemsByExpenseId(expense.id);
          for (const item of items) {
            const key = item.description.toLowerCase().trim();
            const existing = itemMap.get(key) || { totalSpent: 0, count: 0 };
            itemMap.set(key, {
              totalSpent: existing.totalSpent + item.totalPrice,
              count: existing.count + (item.quantity || 1),
            });
          }
        } catch {
          // skip failed loads
        }
      }

      const result: ItemBreakdown[] = Array.from(itemMap.entries())
        .map(([description, data]) => ({
          description,
          totalSpent: data.totalSpent,
          count: data.count,
          avgPrice: data.count > 0 ? data.totalSpent / data.count : 0,
        }))
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 20);

      setItemBreakdown(result);
    };

    computeItemBreakdown();
  }, [filteredExpenses]);

  return {
    isLoading,
    dailySpending,
    categorySpending,
    summary,
    dateRange,
    itemBreakdown,
    budgetComparison,
    dayOfWeekSpending,
    periodComparison,
    anomalies,
    predictions,
  };
}
