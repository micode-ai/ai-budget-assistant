import { useState, useEffect, useMemo } from 'react';
import { api } from '@/services/api';
import { useExpenseStore } from '@/stores/expenseStore';
import type { TimeRange, CategorySpending, SpendingAnomalyItem, BudgetPredictionItem } from './useAnalytics';

/** A category this far above its usual level is listed as an anomaly. */
const ANOMALY_THRESHOLD_PCT = 30;

/**
 * Pure: the anomaly list IS the category donut's "vs 3-month average" chip at
 * +30% or more — one computation, so the two can never disagree.
 *
 * It used to come from `GET /insights`, which always answered for the CURRENT
 * month whatever period was open, ignored the currency filter, and summed
 * amounts across currencies. The category tree already has every property the
 * list needs: the selected period and currency, split attribution, the
 * display-currency conversion and same-days trailing windows.
 */
export function anomaliesFromCategories(
  categorySpending: CategorySpending[],
  timeRange: TimeRange,
  periodStart: Date,
): SpendingAnomalyItem[] {
  if (timeRange !== 'month') return [];
  const period = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}`;
  return categorySpending
    .filter((c) => c.vsAverage != null && c.vsAverage >= ANOMALY_THRESHOLD_PCT)
    .map((c) => ({
      categoryId: c.categoryId ?? 'uncategorized',
      categoryName: c.name,
      currentAmount: c.amount,
      averageAmount: c.amount / (1 + (c.vsAverage as number) / 100),
      percentageChange: Math.round(c.vsAverage as number),
      period,
    }))
    .sort((a, b) => b.percentageChange - a.percentageChange);
}

export function useSpendingAnomalies(
  categorySpending: CategorySpending[],
  timeRange: TimeRange,
  periodStart: Date,
) {
  const expenses = useExpenseStore((s) => s.expenses);
  const [predictions, setPredictions] = useState<BudgetPredictionItem[]>([]);

  const anomalies = useMemo(
    () => anomaliesFromCategories(categorySpending, timeRange, periodStart),
    [categorySpending, timeRange, periodStart],
  );

  // Budget predictions still come from the server (budget progress lives
  // there); refreshed when expenses change. Offline they are simply absent.
  useEffect(() => {
    let cancelled = false;
    api
      .getInsights()
      .then((data) => {
        if (!cancelled) setPredictions(data.predictions || []);
      })
      .catch(() => {
        if (!cancelled) setPredictions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [expenses]);

  return { anomalies, predictions };
}
