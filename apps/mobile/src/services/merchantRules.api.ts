import { httpClient } from './http-client';
import type { MerchantCategoryRule, MerchantRuleReapplyPreview } from '@budget/shared-types';

export const merchantRulesApi = {
  listRules(): Promise<MerchantCategoryRule[]> {
    return httpClient.request<MerchantCategoryRule[]>('/merchant-rules');
  },

  deleteRule(id: string): Promise<void> {
    return httpClient.request<void>(`/merchant-rules/${id}`, { method: 'DELETE' });
  },

  previewReapplyRule(id: string): Promise<MerchantRuleReapplyPreview> {
    return httpClient.request<MerchantRuleReapplyPreview>(`/merchant-rules/${id}/reapply-preview`);
  },

  reapplyRule(id: string, categoryIds: string[]): Promise<{ updated: number }> {
    return httpClient.request<{ updated: number }>(`/merchant-rules/${id}/reapply`, {
      method: 'POST',
      body: JSON.stringify({ categoryIds }),
    });
  },
};
