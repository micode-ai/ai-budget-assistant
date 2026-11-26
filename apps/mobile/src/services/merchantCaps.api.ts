import type { MerchantSpendingCap, UpsertMerchantCapDto } from '@budget/shared-types';
import { httpClient } from './http-client';

export const merchantCapsApi = {
  getMerchantCaps() {
    return httpClient.request<MerchantSpendingCap[]>('/merchant-caps');
  },

  saveMerchantCap(dto: UpsertMerchantCapDto) {
    return httpClient.request<MerchantSpendingCap>('/merchant-caps', {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  deleteMerchantCap(id: string) {
    return httpClient.request<void>(`/merchant-caps/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
