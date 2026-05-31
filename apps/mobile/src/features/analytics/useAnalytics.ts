import { useEffect } from 'react';
import { useCategoryStore } from '@/stores/categoryStore';
import { useTagStore } from '@/stores/tagStore';
import { useProjectStore } from '@/stores/projectStore';
import { useFilteredTransactions } from './useFilteredTransactions';
import { useDailySpending } from './useDailySpending';
import { useCategoryAnalytics } from './useCategoryAnalytics';
import { useMerchantAnalytics } from './useMerchantAnalytics';
import { useIncomeAnalytics } from './useIncomeAnalytics';
import { useSummaryAnalytics } from './useSummaryAnalytics';
import { useBudgetComparison } from './useBudgetComparison';
import { useDayOfWeekAnalytics } from './useDayOfWeekAnalytics';
import { usePeriodComparison } from './usePeriodComparison';
import { useSpendingAnomalies } from './useSpendingAnomalies';
import { useItemBreakdown } from './useItemBreakdown';
import { useTagSpending } from './useTagSpending';
import { useProjectSpending } from './useProjectSpending';

// ─── Types (public API, re-exported for consumers) ───────────────────────────

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
  currencyCode: import('@budget/shared-types').Currency;
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

export interface IncomeCategorySpending {
  categoryId: string | null;
  name: string;
  amount: number;
  percentage: number;
  color: string;
}

// ─── Composition hook ────────────────────────────────────────────────────────

export function useAnalytics(
  timeRange: TimeRange = 'month',
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
) {
  const { categories, loadCategories } = useCategoryStore();
  const { tags, loadTags } = useTagStore();
  const { projects, loadProjects } = useProjectStore();

  useEffect(() => {
    if (categories.length === 0) loadCategories();
    if (tags.length === 0) loadTags();
    if (projects.length === 0) loadProjects();
  }, [categories.length, tags.length, projects.length, loadCategories, loadTags, loadProjects]);

  const { dateRange } = useFilteredTransactions(timeRange, currencyCode, selectedMonth, selectedYear);
  const { dailySpending } = useDailySpending(timeRange, currencyCode, selectedMonth, selectedYear);
  const { categorySpending } = useCategoryAnalytics(timeRange, currencyCode, selectedMonth, selectedYear);
  const { merchantSpending } = useMerchantAnalytics(timeRange, currencyCode, selectedMonth, selectedYear);
  const { incomeByCategory } = useIncomeAnalytics(timeRange, currencyCode, selectedMonth, selectedYear);
  const { summary } = useSummaryAnalytics(timeRange, currencyCode, selectedMonth, selectedYear);
  const { budgetComparison } = useBudgetComparison(timeRange, currencyCode, selectedMonth, selectedYear);
  const { dayOfWeekSpending } = useDayOfWeekAnalytics(timeRange, currencyCode, selectedMonth, selectedYear);
  const { periodComparison } = usePeriodComparison(timeRange, currencyCode, selectedMonth, selectedYear);
  const { anomalies, predictions } = useSpendingAnomalies(timeRange, currencyCode, selectedMonth, selectedYear);
  const { itemBreakdown } = useItemBreakdown(timeRange, currencyCode, selectedMonth, selectedYear);
  const { tagSpending } = useTagSpending(timeRange, currencyCode, selectedMonth, selectedYear);
  const { projectSpending } = useProjectSpending(timeRange, currencyCode, selectedMonth, selectedYear);

  return {
    isLoading: false,
    dailySpending,
    categorySpending,
    merchantSpending,
    incomeByCategory,
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
