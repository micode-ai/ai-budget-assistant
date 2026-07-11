import { httpClient } from './http-client';
import type {
  CommunityPriceResponse,
  CommunityPriceMapPoint,
  CommunityProductSearchItem,
  CommunityPricePeriod,
} from '@budget/shared-types';

export const communityPricesApi = {
  getCommunityPrices(product: string, region: string | null, period: CommunityPricePeriod) {
    let query = `product=${encodeURIComponent(product)}`;
    if (region) query += `&region=${encodeURIComponent(region)}`;
    query += `&period=${encodeURIComponent(period)}`;
    return httpClient.request<CommunityPriceResponse>(`/price-history/community?${query}`);
  },

  getCommunityMap(product: string, region: string | null, period: CommunityPricePeriod) {
    let query = `product=${encodeURIComponent(product)}`;
    if (region) query += `&region=${encodeURIComponent(region)}`;
    query += `&period=${encodeURIComponent(period)}`;
    return httpClient.request<CommunityPriceMapPoint[]>(`/price-history/community/map?${query}`);
  },

  searchCommunityProducts(q: string) {
    return httpClient.request<CommunityProductSearchItem[]>(
      `/price-history/community/products?q=${encodeURIComponent(q)}`,
    );
  },
};
