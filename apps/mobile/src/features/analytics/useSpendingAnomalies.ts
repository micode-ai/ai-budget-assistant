import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/services/api';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { useFilteredTransactions } from './useFilteredTransactions';
import type { TimeRange, SpendingAnomalyItem, BudgetPredictionItem } from './useAnalytics';

export function useSpendingAnomalies(
  timeRange: TimeRange,
  currencyCode?: string,
  selectedMonth?: number,
  selectedYear?: number,
) {
  const { t } = useTranslation();
  const { expenses, filteredExpenses, categories, getAmount, toDisplayCurrency, dateRange } =
    useFilteredTransactions(timeRange, currencyCode, selectedMonth, selectedYear);

  const [anomalies, setAnomalies] = useState<SpendingAnomalyItem[]>([]);
  const [predictions, setPredictions] = useState<BudgetPredictionItem[]>([]);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        const data = await api.getInsights();
        setAnomalies(data.anomalies || []);
        setPredictions(data.predictions || []);
      } catch {
        const localAnomalies: SpendingAnomalyItem[] = [];
        const currentByCategory = new Map<string, { amount: number; name: string }>();

        for (const expense of filteredExpenses) {
          const catId = expense.categoryId || 'uncategorized';
          const cat = expense.categoryId ? categories.find((c) => c.id === expense.categoryId) : undefined;
          const current = currentByCategory.get(catId) || {
            amount: 0,
            name: cat ? getCategoryDisplayName(cat, t) : t('common.uncategorized'),
          };
          currentByCategory.set(catId, { amount: current.amount + getAmount(expense), name: current.name });
        }

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

  return { anomalies, predictions };
}
