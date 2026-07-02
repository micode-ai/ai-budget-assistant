export interface StoreLatestPrice {
  merchantName: string;
  latestPrice: number;
  latestDate: string; // ISO date YYYY-MM-DD
}

export interface PriceHistoryProduct {
  rawName: string;           // original expense_items.canonical_name — key for upsertAlias
  canonicalName: string;
  priceChangePct: number; // positive = more expensive, e.g. 23.0
  currentAvgPrice: number;
  baseAvgPrice: number;
  currency: string;
  purchaseCount: number;
  stores: StoreLatestPrice[];
  pricePoints: { itemId: string; date: string; price: number; merchant: string }[];
}

export type PriceHistoryPeriod = '3m' | '6m' | '12m' | 'all';

export interface PriceHistoryResponse {
  inflationIndex: number | null; // null when < 3 qualifying products
  period: PriceHistoryPeriod;
  productCount: number;
  currency: string;
  products: PriceHistoryProduct[];
}

export interface ProductListItem {
  rawName: string;
  canonicalName: string; // alias.canonicalName ?? rawName
  purchaseCount: number;
  lastSeen: string; // ISO date
}

export interface UpsertAliasDto {
  rawName: string;
  canonicalName: string;
}

export interface MergeProductsDto {
  rawNames: string[];
  canonicalName: string;
}
