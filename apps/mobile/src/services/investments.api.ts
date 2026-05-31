import type { PortfolioHolding, InvestmentTransaction } from '@budget/shared-types';
import type { AIInsightsResponse } from '@budget/shared-types';
import type {
  AssetSearchResult,
  CreatePortfolioHoldingDto,
  CreateInvestmentTransactionDto,
  UpdateInvestmentTransactionDto,
  PortfolioSummaryResponse,
  PortfolioAnalyticsResponse,
} from '@budget/shared-types';
import { httpClient } from './http-client';

export const investmentsApi = {
  searchAssets(query: string) {
    return httpClient.request<AssetSearchResult[]>(
      `/investments/assets/search?q=${encodeURIComponent(query)}`,
    );
  },

  getPortfolioHoldings() {
    return httpClient.request<PortfolioHolding[]>('/investments/holdings');
  },

  createPortfolioHolding(data: CreatePortfolioHoldingDto) {
    return httpClient.request<PortfolioHolding>('/investments/holdings', {
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
    return httpClient.request<InvestmentTransaction[]>(`/investments/transactions${params}`);
  },

  createInvestmentTransaction(data: CreateInvestmentTransactionDto) {
    return httpClient.request<InvestmentTransaction>('/investments/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  updateInvestmentTransaction(id: string, data: UpdateInvestmentTransactionDto) {
    return httpClient.request<InvestmentTransaction>(`/investments/transactions/${id}`, {
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
    return httpClient.request<PortfolioSummaryResponse>('/investments/summary');
  },

  getPortfolioAnalytics(period: string, benchmark?: string) {
    return httpClient.request<PortfolioAnalyticsResponse>('/investments/analytics', {
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
