export type ChartType = 'bar' | 'line' | 'donut' | 'pie' | 'grouped_bar' | 'stacked_bar';

export type DrillDownLevel = 'year' | 'month' | 'week' | 'day' | 'transactions';

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
  id?: string;
  metadata?: Record<string, unknown>;
}

export interface ChartConfig {
  chartType: ChartType;
  title: string;
  subtitle?: string;
  data: ChartDataPoint[];
  drillDown?: {
    enabled: boolean;
    currentLevel: DrillDownLevel;
    nextLevel?: DrillDownLevel;
    parentId?: string;
  };
  formatting?: {
    currencyCode?: string;
    showLegend?: boolean;
    showValues?: boolean;
  };
  highlights?: Array<{
    dataIndex: number;
    type: 'anomaly' | 'peak' | 'low';
    message: string;
  }>;
}

export type InsightChartType = 'anomaly_spike' | 'category_comparison' | 'trend_change' | 'budget_burndown' | 'savings_opportunity';

export type InvestmentInsightType =
  | 'concentration_risk'
  | 'sector_imbalance'
  | 'underperformer'
  | 'overperformer'
  | 'benchmark_deviation'
  | 'diversification_gap'
  | 'cost_basis_alert'
  | 'fee_impact';

export interface AIInsightChart {
  id: string;
  insightType: InsightChartType;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  chartConfig: ChartConfig;
  actionSuggestion?: string;
  generatedAt: string;
}
