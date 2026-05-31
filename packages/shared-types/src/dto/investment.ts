import type { AssetType, InvestmentTransactionType, PortfolioSummary, PortfolioPerformance } from '../entities';

export interface AssetSearchResult {
  symbol: string;
  name: string;
  type: AssetType;
  exchange: string;
  currency: string;
}

export interface AssetSearchResponse {
  results: AssetSearchResult[];
}

export interface CreatePortfolioHoldingDto {
  localId: string;
  assetSymbol: string;
  assetName: string;
  assetType: AssetType;
  assetExchange?: string;
  assetCurrency?: string;
  notes?: string;
}

export interface CreateInvestmentTransactionDto {
  localId: string;
  holdingId: string;
  type: InvestmentTransactionType;
  quantity: number;
  pricePerUnit: number;
  fee?: number;
  date: string;
  notes?: string;
}

export interface UpdateInvestmentTransactionDto {
  quantity?: number;
  pricePerUnit?: number;
  fee?: number;
  date?: string;
  notes?: string;
}

export interface PortfolioSummaryResponse {
  summary: PortfolioSummary;
  lastPriceUpdate: string;
}

export interface PortfolioAnalyticsRequest {
  period: 'week' | 'month' | 'quarter' | 'year' | 'all';
  benchmark?: string;
}

export interface PortfolioAnalyticsResponse {
  performance: PortfolioPerformance;
  allocation: Array<{
    assetType: AssetType;
    value: number;
    percentage: number;
  }>;
  topGainers: Array<{ symbol: string; pnlPercent: number }>;
  topLosers: Array<{ symbol: string; pnlPercent: number }>;
}
