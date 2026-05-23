import type { AIInsightsResponse } from '@budget/shared-types';
import { httpClient } from './http-client';

export const investmentsApi = {
  searchAssets(query: string) {
    return httpClient.request<{ symbol: string; name: string; type: string; exchange: string; currency: string }[]>(
      `/investments/assets/search?q=${encodeURIComponent(query)}`,
    );
  },

  getPortfolioHoldings() {
    return httpClient.request<any[]>('/investments/holdings');
  },

  createPortfolioHolding(data: any) {
    return httpClient.request<any>('/investments/holdings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  removePortfolioHolding(id: string) {
    return httpClient.request<{ success: boolean }>(`/investments/holdings/${id}`, {
      method: 'DELETE',
    });
  },

  getInvestmentTransactions(holdingId?: string) {
    const params = holdingId ? `?holdingId=${holdingId}` : '';
    return httpClient.request<any[]>(`/investments/transactions${params}`);
  },

  createInvestmentTransaction(data: any) {
    return httpClient.request<any>('/investments/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  updateInvestmentTransaction(id: string, data: any) {
    return httpClient.request<any>(`/investments/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  deleteInvestmentTransaction(id: string) {
    return httpClient.request<{ success: boolean }>(`/investments/transactions/${id}`, {
      method: 'DELETE',
    });
  },

  getPortfolioSummary() {
    return httpClient.request<any>('/investments/summary');
  },

  getPortfolioAnalytics(period: string, benchmark?: string) {
    return httpClient.request<any>('/investments/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period, benchmark }),
    });
  },

  getAssetPriceHistory(holdingId: string, days: number = 30) {
    return httpClient.request<{ dates: string[]; prices: number[] }>(
      `/investments/holdings/${holdingId}/price-history?days=${days}`,
    );
  },

  refreshInvestmentPrices() {
    return httpClient.request<{ success: boolean }>('/investments/refresh-prices', {
      method: 'POST',
    });
  },

  getInvestmentInsights(language?: string) {
    const params = language ? `?language=${encodeURIComponent(language)}` : '';
    return httpClient.request<AIInsightsResponse>(`/investments/insights${params}`);
  },
};
