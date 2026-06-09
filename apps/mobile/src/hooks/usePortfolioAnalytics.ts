import { useMemo } from 'react';
import type { PortfolioAnalyticsResponse } from '@budget/shared-types';

const ALLOCATION_COLORS = [
  '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#14B8A6', '#6366F1',
];

export interface PerformancePoint { date: string; value: number }
export interface AllocationSlice { type: string; percentage: number; color: string }
export interface BenchmarkPoint { name: string; portfolioReturn: number; benchmarkReturn: number }

export interface PortfolioAnalytics {
  performanceHistory: PerformancePoint[];
  allocation: AllocationSlice[];
  benchmarkComparison: BenchmarkPoint[];
  topGainers: PortfolioAnalyticsResponse['topGainers'];
  topLosers: PortfolioAnalyticsResponse['topLosers'];
  latestValue: number;
  earliestValue: number;
  periodReturn: number;
  isPeriodPositive: boolean;
}

export function usePortfolioAnalytics(analytics: PortfolioAnalyticsResponse | null): PortfolioAnalytics {
  const performanceHistory = useMemo<PerformancePoint[]>(() => {
    if (!analytics?.performance?.dates?.length) return [];
    return analytics.performance.dates.map((date, i) => ({
      date,
      value: analytics.performance.values[i] ?? 0,
    }));
  }, [analytics?.performance]);

  const allocation = useMemo<AllocationSlice[]>(() => {
    if (!analytics?.allocation?.length) return [];
    return analytics.allocation.map((item, i) => ({
      type: item.assetType,
      percentage: item.percentage,
      color: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
    }));
  }, [analytics?.allocation]);

  const benchmarkComparison = useMemo<BenchmarkPoint[]>(() => {
    if (!analytics?.performance?.benchmarkValues?.length || !analytics?.performance?.benchmarkName) return [];
    const perfValues = analytics.performance.values;
    const benchValues = analytics.performance.benchmarkValues;
    if (perfValues.length < 2 || benchValues.length < 1) return [];

    const firstPerfValue = perfValues[0];
    const lastPerfValue = perfValues[perfValues.length - 1];
    const portfolioReturn = firstPerfValue > 0
      ? ((lastPerfValue - firstPerfValue) / firstPerfValue) * 100
      : 0;
    // Benchmark values from API are already normalized percentages (benchValues[0]=0 baseline)
    const benchmarkReturn = benchValues[benchValues.length - 1];

    if (!isFinite(portfolioReturn) || !isFinite(benchmarkReturn)) return [];

    return [{ name: analytics.performance.benchmarkName, portfolioReturn, benchmarkReturn }];
  }, [analytics?.performance]);

  const latestValue = performanceHistory.length > 0 ? performanceHistory[performanceHistory.length - 1].value : 0;
  const earliestValue = performanceHistory.length > 0 ? performanceHistory[0].value : 0;
  const periodReturn = earliestValue > 0 ? ((latestValue - earliestValue) / earliestValue) * 100 : 0;
  const isPeriodPositive = periodReturn >= 0;

  return {
    performanceHistory,
    allocation,
    benchmarkComparison,
    topGainers: analytics?.topGainers ?? [],
    topLosers: analytics?.topLosers ?? [],
    latestValue,
    earliestValue,
    periodReturn,
    isPeriodPositive,
  };
}
