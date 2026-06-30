import type {
  PurchaseRequest,
  PurchaseRequestStatus,
  ApprovalRule,
  CreatePurchaseRequestDto,
  VotePurchaseRequestDto,
} from '@budget/shared-types';
import { httpClient } from './http-client';

export const purchaseRequestsApi = {
  getPurchaseRequests(status?: PurchaseRequestStatus) {
    const qs = status ? `?status=${status}` : '';
    return httpClient.request<PurchaseRequest[]>(`/purchase-requests${qs}`);
  },

  getPurchaseRequest(id: string) {
    return httpClient.request<PurchaseRequest>(`/purchase-requests/${id}`);
  },

  createPurchaseRequest(dto: CreatePurchaseRequestDto) {
    return httpClient.request<PurchaseRequest>('/purchase-requests', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  votePurchaseRequest(id: string, dto: VotePurchaseRequestDto) {
    return httpClient.request<PurchaseRequest>(`/purchase-requests/${id}/vote`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  convertPurchaseRequest(id: string) {
    return httpClient.request<{ expenseId: string }>(`/purchase-requests/${id}/convert`, {
      method: 'POST',
    });
  },

  markPurchaseRequestAsPurchased(id: string) {
    return httpClient.request<void>(`/purchase-requests/${id}/mark-purchased`, {
      method: 'POST',
    });
  },

  cancelPurchaseRequest(id: string) {
    return httpClient.request<void>(`/purchase-requests/${id}`, { method: 'DELETE' });
  },

  updateAccountApprovalRule(rule: ApprovalRule) {
    return httpClient.request<void>('/purchase-requests/settings/approval-rule', {
      method: 'PATCH',
      body: JSON.stringify({ rule }),
    });
  },

  getPurchaseRequestPendingCount() {
    return httpClient.request<number>('/purchase-requests/pending-count');
  },
};
