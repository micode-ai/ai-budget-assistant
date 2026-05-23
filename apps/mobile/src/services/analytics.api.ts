import type { DrillDownRequest, DrillDownResponse, AIInsightsResponse, StoryDashboardResponse } from '@budget/shared-types';
import { httpClient } from './http-client';

export const analyticsApi = {
  getAnalyticsSummary(startDate: string, endDate: string) {
    return httpClient.request<any>(`/analytics/summary?startDate=${startDate}&endDate=${endDate}`);
  },

  getAnalyticsTrends(startDate: string, endDate: string) {
    return httpClient.request<any>(`/analytics/trends?startDate=${startDate}&endDate=${endDate}`);
  },

  getAnalyticsItemBreakdown(startDate: string, endDate: string) {
    return httpClient.request<any[]>(`/analytics/items?startDate=${startDate}&endDate=${endDate}`);
  },

  getAnalyticsByTag(startDate: string, endDate: string) {
    return httpClient.request<any>(`/analytics/by-tag?startDate=${startDate}&endDate=${endDate}`);
  },

  getAnalyticsByProject() {
    return httpClient.request<any>('/analytics/by-project');
  },

  drillDown(request: DrillDownRequest) {
    return httpClient.request<DrillDownResponse>('/analytics/drill-down', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  getInsights() {
    return httpClient.request<{
      anomalies: {
        categoryId: string;
        categoryName: string;
        currentAmount: number;
        averageAmount: number;
        percentageChange: number;
        period: string;
      }[];
      predictions: {
        budgetId: string;
        budgetName: string;
        estimatedExhaustionDate?: string;
        dailyBurnRate: number;
        daysRemaining: number;
        projectedTotal: number;
        currencyCode: string;
      }[];
    }>('/insights');
  },

  getAIInsights(language?: string) {
    const params = language ? `?language=${language}` : '';
    return httpClient.request<AIInsightsResponse>(`/insights/ai-charts${params}`);
  },

  getSpendingStory(
    period: 'week' | 'month',
    forceRegenerate?: boolean,
    language?: string,
    month?: number,
    year?: number,
  ) {
    return httpClient.request<StoryDashboardResponse>('/insights/story', {
      method: 'POST',
      body: JSON.stringify({ period, forceRegenerate, language, month, year }),
    });
  },

  getFatFinderReport(language?: string, forceRegenerate?: boolean, month?: number, year?: number) {
    return httpClient.request<any>('/insights/fat-finder', {
      method: 'POST',
      body: JSON.stringify({ language, forceRegenerate, month, year }),
    });
  },
};
