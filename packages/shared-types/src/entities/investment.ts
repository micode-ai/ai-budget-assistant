import type { AssetType, InvestmentTransactionType, SyncStatus } from './primitives';

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  type: AssetType;
  exchange?: string;
  currentPrice?: number;
  priceCurrency: string;
  logoUrl?: string;
  lastPriceUpdate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortfolioHolding {
  id: string;
  localId: string;
  serverId?: string;
  accountId: string;
  userId: string;
  assetId: string;
  asset?: Asset;
  quantity: number;
  averageCostBasis: number;
  totalInvested: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface InvestmentTransaction {
  id: string;
  localId: string;
  serverId?: string;
  holdingId: string;
  accountId: string;
  userId: string;
  type: InvestmentTransactionType;
  quantity: number;
  pricePerUnit: number;
  totalAmount: number;
  fee: number;
  date: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface AssetPriceHistory {
  id: string;
  assetId: string;
  date: Date;
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  volume?: number;
}

export interface PortfolioHoldingSummary {
  holdingId: string;
  assetId: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  quantity: number;
  averageCostBasis: number;
  currentPrice: number;
  marketValue: number;
  totalInvested: number;
  pnl: number;
  pnlPercent: number;
  dayChange: number;
  dayChangePercent: number;
  allocationPercent: number;
}

export interface PortfolioSummary {
  totalValue: number;
  totalInvested: number;
  totalPnL: number;
  totalPnLPercent: number;
  dayChange: number;
  dayChangePercent: number;
  holdings: PortfolioHoldingSummary[];
}

export interface PortfolioPerformance {
  dates: string[];
  values: number[];
  investedValues: number[];
  benchmarkValues?: number[];
  benchmarkName?: string;
}
