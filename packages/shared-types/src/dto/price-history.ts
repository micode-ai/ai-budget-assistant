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
  rawName: string;        // primary key (rawNames[0]) — kept for backward compat
  rawNames: string[];     // all underlying rawNames that share this canonicalName
  canonicalName: string;  // alias.canonicalName ?? rawName
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

export interface BasketCompareItem {
  canonicalName: string;
  quantity: number;
}

export interface BasketStoreResult {
  merchantName: string;
  estimatedTotal: number;
  coveredItems: number;
  totalItems: number;
  missingItems: string[];  // canonicalNames this store cannot price
  hasStale: boolean;       // any contributing price > 90 days old
  isCheapest: boolean;     // best store among full (or >=80%) coverage
  distanceKm?: number;     // populated in M4 (geo); undefined in this plan
  nearby?: boolean;        // populated in M4
  lat?: number;            // store coordinates (from your geo-tagged expenses); M4
  lng?: number;
}

export interface BasketPerItemCheapest {
  canonicalName: string;
  cheapestStore: string | null;
  price: number | null;
}

export interface BasketCompareResponse {
  currency: string;
  stores: BasketStoreResult[];         // sorted cheapest -> most expensive
  perItemCheapest: BasketPerItemCheapest[];
  missingEverywhere: string[];         // items no visited store can price
}
