// Community Price Map (ABA-335). M1 ships only the write pipeline + opt-in — these
// shapes describe the future read API (M2) and are added now so the API/mobile
// layers can consume them without drift once the aggregator lands. Anonymous by
// design: nothing here carries an accountId, userId, expenseId, or contributor
// coordinates — only the k-anonymity-gated aggregate.

/** One store's price point for a given product, already k-anonymity-gated. */
export interface CommunityPriceStore {
  merchantName: string;
  medianPrice: number;
  minPrice: number;
  receiptCount: number;
  contributorCount: number;
  currencyCode: string;
  isCheapest: boolean;
  lat?: number;
  lng?: number;
}

export type CommunityPricePeriod = '1w' | '4w';

/** GET /price-history/community?product=&region=&period= response (M2). */
export interface CommunityPriceResponse {
  product: string;
  region: string | null;
  currency: string;
  period: CommunityPricePeriod;
  weekLabel: string;
  stores: CommunityPriceStore[]; // sorted cheapest-first
}

/** GET /price-history/community/map response point (M2). */
export interface CommunityPriceMapPoint {
  merchantName: string;
  lat: number;
  lng: number;
  medianPrice: number;
  currencyCode: string;
  receiptCount: number;
  isCheapest: boolean;
}

/** GET /price-history/community/products?q= autocomplete row (M2). */
export interface CommunityProductSearchItem {
  canonicalName: string;
  regionsAvailable: number; // count of regions currently satisfying the K-gate
}

/** PATCH body for the personal contribution opt-in toggle. */
export interface UpdateCommunityPricePrefDto {
  contributeCommunityPrices: boolean;
}
