import { useState, useEffect, useMemo } from 'react';
import { InteractionManager } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useTagStore } from '@/stores/tagStore';
import { useProjectStore } from '@/stores/projectStore';
import { useAccountStore } from '@/stores/accountStore';
import { useExchangeRateStore, convertAmount } from '@/stores/exchangeRateStore';
import { loadItemsByExpenseId } from '@/db/expenseItemRepository';
import { getAllExpenseTagMappings } from '@/db/tagRepository';
import { getAllProjectExpenseMappings } from '@/db/projectRepository';
import { getStartOfMonth, getEndOfMonth, getStartOfWeek, getEndOfWeek } from '@budget/shared-utils';
import { api } from '@/services/api';
import type { Currency } from '@budget/shared-types';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';

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
  vsAverage: number | null;
}

export interface AnalyticsSummary {
  totalSpent: number;
  totalDiscountSavings: number;
  averagePerDay: number;
  transactionCount: number;
  trend: number;
  vsAverage: number;
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

export interface TagSpending {
  tagId: string;
  name: string;
  amount: number;
  percentage: number;
  color: string;
}

export interface ProjectSpending {
  projectId: string;
  name: string;
  amount: number;
  percentage: number;
  color: string;
  budget?: number;
}

export interface MerchantSpending {
  merchant: string;
  amount: number;
  percentage: number;
  color: string;
}

const TAG_COLORS = [
  '#6366F1', // Indigo
  '#EC4899', // Pink
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#8B5CF6', // Violet
  '#EF4444', // Red
  '#14B8A6', // Teal
  '#F97316', // Orange
  '#6B7280', // Gray
];

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

const MERCHANT_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#F97316',
  '#6366F1',
];
const MERCHANT_OTHER_COLOR = '#9CA3AF';

export function useAnalytics(timeRange: TimeRange = 'month', currencyCode?: string, selectedMonth?: number, selectedYear?: number) {
  const { t } = useTranslation();
  const { expenses } = useExpenseStore();
  const { categories, loadCategories } = useCategoryStore();
  const { tags, loadTags } = useTagStore();
  const { projects, loadProjects } = useProjectStore();
  const { rates } = useExchangeRateStore();
  const [isLoading] = useState(false);

  // Display currency: selected currency or user's base currency
  const displayCurrency = currencyCode || useExchangeRateStore.getState().baseCurrency || 'USD';

  // Convert expense amount to the display currency
  const toDisplayCurrency = useMemo(() => {
    return (amount: number, fromCurrency: string) =>
      convertAmount(amount, fromCurrency, displayCurrency, rates);
  }, [rates, displayCurrency]);

  // Ensure reference data is loaded
  useEffect(() => {
    if (categories.length === 0) loadCategories();
    if (tags.length === 0) loadTags();
    if (projects.length === 0) loadProjects();
  }, [categories.length, tags.length, projects.length, loadCategories, loadTags, loadProjects]);

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

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (e.isDeleted) return false;
      if (currencyCode && e.currencyCode !== currencyCode) return false;
      const expenseDate = new Date(e.date);
      return expenseDate >= dateRange.startDate && expenseDate <= dateRange.endDate;
    });
  }, [expenses, dateRange, currencyCode]);

  // Get expense amount converted to display currency
  const getAmount = useMemo(() => {
    return (expense: { amount: number; currencyCode: string }) =>
      toDisplayCurrency(expense.amount, expense.currencyCode);
  }, [toDisplayCurrency]);

  const dailySpending = useMemo((): DailySpending[] => {
    const dailyMap = new Map<string, number>();
    const result: DailySpending[] = [];

    // Derive the target month/year from the dateRange
    const rangeYear = dateRange.startDate.getFullYear();
    const rangeMonth = dateRange.startDate.getMonth();

    // Initialize days based on time range
    if (timeRange === 'week') {
      for (let i = 0; i < 7; i++) {
        const date = new Date(dateRange.startDate);
        date.setDate(date.getDate() + i);
        const dateKey = date.toISOString().split('T')[0];
        dailyMap.set(dateKey, 0);
      }
    } else if (timeRange === 'month') {
      const daysInMonth = new Date(rangeYear, rangeMonth + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(rangeYear, rangeMonth, i);
        const dateKey = date.toISOString().split('T')[0];
        dailyMap.set(dateKey, 0);
      }
    } else {
      // Year - show monthly totals
      for (let i = 0; i < 12; i++) {
        const monthKey = `${rangeYear}-${String(i + 1).padStart(2, '0')}`;
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
      dailyMap.set(key, current + getAmount(expense));
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
  }, [filteredExpenses, timeRange, dateRange, t, getAmount]);

  const categorySpending = useMemo((): CategorySpending[] => {
    const total = filteredExpenses.reduce((sum, e) => sum + getAmount(e), 0);
    if (total === 0) return [];

    const categoryMap = new Map<string | null, number>();

    filteredExpenses.forEach((expense) => {
      const key = expense.categoryId || null;
      const current = categoryMap.get(key) || 0;
      categoryMap.set(key, current + getAmount(expense));
    });

    // Per-category 3-month trailing average (month view only)
    const trailingMonths = 3;
    const getCategoryVsAverage = (categoryId: string | null, currentAmount: number): number | null => {
      if (timeRange !== 'month') return null;
      const monthlyTotals: number[] = [];
      for (let i = 1; i <= trailingMonths; i++) {
        const d = new Date(dateRange.startDate.getFullYear(), dateRange.startDate.getMonth() - i, 1);
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const monthTotal = expenses
          .filter((e) => {
            if (e.isDeleted) return false;
            if (currencyCode && e.currencyCode !== currencyCode) return false;
            if ((e.categoryId || null) !== categoryId) return false;
            const ed = new Date(e.date);
            return ed >= monthStart && ed < monthEnd;
          })
          .reduce((s, e) => s + toDisplayCurrency(e.amount, e.currencyCode), 0);
        monthlyTotals.push(monthTotal);
      }
      if (!monthlyTotals.some((t) => t > 0)) return null;
      const rollingAverage = monthlyTotals.reduce((s, t) => s + t, 0) / trailingMonths;
      if (rollingAverage === 0) return currentAmount > 0 ? 100 : 0;
      return Math.round(((currentAmount - rollingAverage) / rollingAverage) * 10000) / 100;
    };

    const result: CategorySpending[] = [];
    let colorIndex = 0;

    categoryMap.forEach((amount, categoryId) => {
      const category = categoryId
        ? categories.find(c => c.id === categoryId) || categories.find(c => c.name === categoryId)
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

  const merchantSpending = useMemo((): MerchantSpending[] => {
    const withMerchant = filteredExpenses.filter((e) => e.merchant != null && e.merchant.trim() !== '');
    if (withMerchant.length === 0) return [];

    const merchantMap = new Map<string, number>();
    for (const e of withMerchant) {
      const key = e.merchant!.trim();
      merchantMap.set(key, (merchantMap.get(key) || 0) + getAmount(e));
    }

    const total = Array.from(merchantMap.values()).reduce((s, a) => s + a, 0);
    if (total === 0) return [];

    const sorted = Array.from(merchantMap.entries()).sort((a, b) => b[1] - a[1]);
    const TOP = 8;
    const top = sorted.slice(0, TOP);
    const rest = sorted.slice(TOP);

    const result: MerchantSpending[] = top.map(([merchant, amount], i) => ({
      merchant,
      amount,
      percentage: (amount / total) * 100,
      color: MERCHANT_COLORS[i % MERCHANT_COLORS.length],
    }));

    if (rest.length > 0) {
      const otherAmount = rest.reduce((s, [, a]) => s + a, 0);
      result.push({
        merchant: t('analytics.merchantOther'),
        amount: otherAmount,
        percentage: (otherAmount / total) * 100,
        color: MERCHANT_OTHER_COLOR,
      });
    }

    return result;
  }, [filteredExpenses, getAmount, t]);

  const summary = useMemo((): AnalyticsSummary => {
    const totalSpent = filteredExpenses.reduce((sum, e) => sum + getAmount(e), 0);
    const totalDiscountSavings = filteredExpenses.reduce((sum, e) => sum + toDisplayCurrency(e.discountAmount || 0, e.currencyCode), 0);
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

    // Find most expensive category
    const topCategory = categorySpending[0];
    const mostExpensiveCategory = topCategory?.name || null;

    // Calculate trend (simplified - comparing to previous period)
    const trend = 0; // Would need previous period data

    // Compute vsAverage: compare currentTotal to the trailing 3 full calendar months
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
      if (rollingAverage === 0) {
        vsAverage = totalSpent > 0 ? 100 : 0;
      } else {
        vsAverage = Math.round(((totalSpent - rollingAverage) / rollingAverage) * 10000) / 100;
      }
    }

    return {
      totalSpent,
      totalDiscountSavings,
      averagePerDay,
      transactionCount,
      trend,
      vsAverage,
      highestSpendingDay,
      mostExpensiveCategory,
    };
  }, [filteredExpenses, expenses, dateRange, categorySpending, getAmount, toDisplayCurrency]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      days[dayIndex].totalAmount += getAmount(expense);
      days[dayIndex].transactionCount += 1;
    });

    // Reorder: Mon-Sun instead of Sun-Sat
    return [...days.slice(1), days[0]];
  }, [filteredExpenses, t, getAmount]);

  // Period comparison
  const periodComparison = useMemo((): PeriodComparison => {
    const currentTotal = filteredExpenses.reduce((sum, e) => sum + getAmount(e), 0);

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
      .reduce((sum, e) => sum + toDisplayCurrency(e.amount, e.currencyCode), 0);

    const changePercent =
      previousTotal > 0
        ? ((currentTotal - previousTotal) / previousTotal) * 100
        : currentTotal > 0
          ? 100
          : 0;

    return { currentTotal, previousTotal, changePercent };
  }, [filteredExpenses, expenses, dateRange, currencyCode, getAmount, toDisplayCurrency]);

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
          const cat = expense.categoryId ? categories.find(c => c.id === expense.categoryId) : undefined;
          const current = currentByCategory.get(catId) || { amount: 0, name: cat ? getCategoryDisplayName(cat, t) : t('common.uncategorized') };
          currentByCategory.set(catId, {
            amount: current.amount + getAmount(expense),
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
          prevByCategory.set(catId, (prevByCategory.get(catId) || 0) + toDisplayCurrency(expense.amount, expense.currencyCode));
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredExpenses, dateRange, currencyCode, expenses, categories]);

  // Item breakdown for OCR expenses
  const [itemBreakdown, setItemBreakdown] = useState<ItemBreakdown[]>([]);

  useEffect(() => {
    let cancelled = false;
    const computeItemBreakdown = async () => {
      const ocrExpenses = filteredExpenses.filter((e) => e.source === 'ocr');
      if (ocrExpenses.length === 0) {
        if (!cancelled) setItemBreakdown([]);
        return;
      }

      const itemMap = new Map<string, { totalSpent: number; count: number }>();

      for (const expense of ocrExpenses) {
        if (cancelled) return;
        try {
          const items = await loadItemsByExpenseId(expense.id);
          for (const item of items) {
            const key = item.description.toLowerCase().trim();
            const existing = itemMap.get(key) || { totalSpent: 0, count: 0 };
            const convertedPrice = toDisplayCurrency(item.totalPrice, expense.currencyCode);
            itemMap.set(key, {
              totalSpent: existing.totalSpent + convertedPrice,
              count: existing.count + (item.quantity || 1),
            });
          }
        } catch {
          // skip failed loads
        }
      }

      if (cancelled) return;
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

    // Defer until after the tab transition / first paint so the JS thread is
    // free for the navigation animation. Cancellable on unmount or dep change.
    const handle = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) computeItemBreakdown();
    });
    return () => {
      cancelled = true;
      handle.cancel();
    };
  }, [filteredExpenses, toDisplayCurrency]);

  // Tag spending breakdown
  const [tagSpending, setTagSpending] = useState<TagSpending[]>([]);

  useEffect(() => {
    let cancelled = false;
    const computeTagSpending = async () => {
      if (filteredExpenses.length === 0) {
        if (!cancelled) setTagSpending([]);
        return;
      }

      const accountId = useAccountStore.getState().currentAccountId;
      if (!accountId) {
        if (!cancelled) setTagSpending([]);
        return;
      }

      try {
        const mappings = await getAllExpenseTagMappings(accountId);
        if (cancelled) return;
        const expenseIds = new Set(filteredExpenses.map(e => e.id));
        const expenseAmountMap = new Map(filteredExpenses.map(e => [e.id, getAmount(e)]));

        // Aggregate: for each tag, sum amounts of linked expenses in the filtered set
        const tagAmountMap = new Map<string, number>();
        for (const m of mappings) {
          if (!expenseIds.has(m.expenseId)) continue;
          const amount = expenseAmountMap.get(m.expenseId) || 0;
          tagAmountMap.set(m.tagId, (tagAmountMap.get(m.tagId) || 0) + amount);
        }

        const totalTagged = Array.from(tagAmountMap.values()).reduce((s, a) => s + a, 0);
        if (totalTagged === 0) {
          if (!cancelled) setTagSpending([]);
          return;
        }

        const result: TagSpending[] = [];
        let colorIndex = 0;
        for (const [tagId, amount] of tagAmountMap) {
          const tag = tags.find(t => t.id === tagId) || tags.find(t => t.name === tagId);
          result.push({
            tagId,
            name: tag?.name || tagId,
            amount,
            percentage: (amount / totalTagged) * 100,
            color: tag?.color || TAG_COLORS[colorIndex % TAG_COLORS.length],
          });
          colorIndex++;
        }

        if (!cancelled) setTagSpending(result.sort((a, b) => b.amount - a.amount));
      } catch {
        if (!cancelled) setTagSpending([]);
      }
    };

    const handle = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) computeTagSpending();
    });
    return () => {
      cancelled = true;
      handle.cancel();
    };
  }, [filteredExpenses, tags, getAmount]);

  // Project spending breakdown
  const [projectSpending, setProjectSpending] = useState<ProjectSpending[]>([]);

  useEffect(() => {
    let cancelled = false;
    const computeProjectSpending = async () => {
      if (filteredExpenses.length === 0) {
        if (!cancelled) setProjectSpending([]);
        return;
      }

      const accountId = useAccountStore.getState().currentAccountId;
      if (!accountId) {
        if (!cancelled) setProjectSpending([]);
        return;
      }

      try {
        const mappings = await getAllProjectExpenseMappings(accountId);
        if (cancelled) return;
        const expenseIds = new Set(filteredExpenses.map(e => e.id));
        const expenseAmountMap = new Map(filteredExpenses.map(e => [e.id, getAmount(e)]));

        // Aggregate: for each project, sum amounts of linked expenses in the filtered set
        const projectAmountMap = new Map<string, number>();
        for (const m of mappings) {
          if (!expenseIds.has(m.expenseId)) continue;
          const amount = expenseAmountMap.get(m.expenseId) || 0;
          projectAmountMap.set(m.projectId, (projectAmountMap.get(m.projectId) || 0) + amount);
        }

        const totalProjected = Array.from(projectAmountMap.values()).reduce((s, a) => s + a, 0);
        if (totalProjected === 0) {
          if (!cancelled) setProjectSpending([]);
          return;
        }

        const result: ProjectSpending[] = [];
        let colorIndex = 0;
        for (const [projectId, amount] of projectAmountMap) {
          const project = projects.find(p => p.id === projectId) || projects.find(p => p.name === projectId);
          result.push({
            projectId,
            name: project?.name || projectId,
            amount,
            percentage: (amount / totalProjected) * 100,
            color: project?.color || TAG_COLORS[colorIndex % TAG_COLORS.length],
            budget: project?.budget,
          });
          colorIndex++;
        }

        if (!cancelled) setProjectSpending(result.sort((a, b) => b.amount - a.amount));
      } catch {
        if (!cancelled) setProjectSpending([]);
      }
    };

    const handle = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) computeProjectSpending();
    });
    return () => {
      cancelled = true;
      handle.cancel();
    };
  }, [filteredExpenses, projects, getAmount]);

  return {
    isLoading,
    dailySpending,
    categorySpending,
    merchantSpending,
    summary,
    dateRange,
    itemBreakdown,
    budgetComparison,
    dayOfWeekSpending,
    periodComparison,
    anomalies,
    predictions,
    tagSpending,
    projectSpending,
  };
}
