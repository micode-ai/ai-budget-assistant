import { httpClient } from './http-client';
import type { MerchantCategoryRule } from '@budget/shared-types';

export const merchantRulesApi = {
  listRules(): Promise<MerchantCategoryRule[]> {
    return httpClient.request<MerchantCategoryRule[]>('/merchant-rules');
  },

  deleteRule(id: string): Promise<void> {
    return httpClient.request<void>(`/merchant-rules/${id}`, { method: 'DELETE' });
  },
};
