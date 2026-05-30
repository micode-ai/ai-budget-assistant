import type { DrillDownLevel, ChartConfig, AIInsightChart } from '../entities';

export interface AnalyticsSummary {
  period: {
    start: string;
    end: string;
  };
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  expensesByCategory: Array<{
    categoryId: string;
    categoryName: string;
    amount: number;
    percentage: number;
    count: number;
    vsAverage?: number | null;
  }>;
  topExpenses: Array<{
    id: string;
    description: string;
    amount: number;
    date: string;
    categoryName: string;
  }>;
  totalDiscountSavings: number;
  trends: {
    vsLastPeriod: number;
    vsAverage: number;
  };
}

export interface InsightsResponse {
  anomalies: Array<{
    categoryId: string;
    categoryName: string;
    currentAmount: number;
    averageAmount: number;
    percentageChange: number;
    period: string;
  }>;
  predictions: Array<{
    budgetId: string;
    budgetName: string;
    estimatedExhaustionDate?: string;
    dailyBurnRate: number;
    daysRemaining: number;
    projectedTotal: number;
    currencyCode: string;
  }>;
}

export interface DrillDownRequest {
  level: DrillDownLevel;
  parentId?: string;
  startDate: string;
  endDate: string;
  currencyCode?: string;
  locale?: string;
}

export interface DrillDownResponse {
  chart: ChartConfig;
  transactions?: Array<{
    id: string;
    description: string;
    amount: number;
    date: string;
    categoryName: string;
    currencyCode: string;
  }>;
  breadcrumb: Array<{
    level: DrillDownLevel;
    label: string;
    id?: string;
  }>;
}

export interface AIInsightsResponse {
  insights: AIInsightChart[];
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
}
