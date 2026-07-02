import { httpClient } from './http-client';
import type {
  PriceHistoryResponse,
  ProductListItem,
  UpsertAliasDto,
  MergeProductsDto,
} from '@budget/shared-types';

export const priceHistoryApi = {
  getPriceHistory(period: '3m' | '6m' | '12m' | 'all' = '6m') {
    return httpClient.request<PriceHistoryResponse>(`/price-history?period=${period}`);
  },

  getProducts() {
    return httpClient.request<ProductListItem[]>('/price-history/products');
  },

  upsertAlias(body: UpsertAliasDto) {
    return httpClient.request<void>('/price-history/products/alias', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  deleteAlias(rawName: string) {
    return httpClient.request<void>(
      `/price-history/products/alias/${encodeURIComponent(rawName)}`,
      { method: 'DELETE' },
    );
  },

  mergeProducts(body: MergeProductsDto) {
    return httpClient.request<void>('/price-history/products/merge', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  ignoreProduct(rawName: string) {
    return httpClient.request<void>(
      `/price-history/products/ignore/${encodeURIComponent(rawName)}`,
      { method: 'POST' },
    );
  },

  backfillProductNames() {
    return httpClient.request<{ updatedCount: number }>('/price-history/products/backfill-ai', {
      method: 'POST',
    });
  },
};
