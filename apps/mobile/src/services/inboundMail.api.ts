import type {
  InboundMailAddressResponse,
  InboundReceiptCountResponse,
  InboundReceiptDetail,
  InboundReceiptListItem,
} from '@budget/shared-types';
import { httpClient } from './http-client';

/**
 * E-receipts forwarded by e-mail (ABA-644). With the server flag off every route
 * answers 404 - callers treat a 404 on `getInboundMailAddress`/`getInboundReceiptCount`
 * as "feature unavailable" (see `isFeatureUnavailable`).
 */
export const inboundMailApi = {
  /** `null` when the user has not created an address yet. */
  getInboundMailAddress() {
    return httpClient.request<InboundMailAddressResponse | null>('/inbound-mail/address');
  },

  createInboundMailAddress() {
    return httpClient.request<InboundMailAddressResponse>('/inbound-mail/address', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  setInboundMailTarget(targetAccountId: string) {
    return httpClient.request<InboundMailAddressResponse>('/inbound-mail/address', {
      method: 'PATCH',
      body: JSON.stringify({ targetAccountId }),
    });
  },

  rotateInboundMailAddress() {
    return httpClient.request<InboundMailAddressResponse>('/inbound-mail/address/rotate', {
      method: 'POST',
    });
  },

  disableInboundMailAddress() {
    return httpClient.request<void>('/inbound-mail/address', { method: 'DELETE' });
  },

  listInboundReceipts(status: 'pending' | 'handled') {
    return httpClient.request<InboundReceiptListItem[]>(`/inbound-receipts?status=${status}`);
  },

  getInboundReceiptCount() {
    return httpClient.request<InboundReceiptCountResponse>('/inbound-receipts/count');
  },

  getInboundReceipt(id: string) {
    return httpClient.request<InboundReceiptDetail>(`/inbound-receipts/${encodeURIComponent(id)}`);
  },

  /** The stored document (an image, for the confirm card preview). 410 once it was cleared. */
  async downloadInboundReceiptDocument(id: string): Promise<Blob> {
    const token = await httpClient.getAuthToken();
    const accountId = httpClient.accountIdGetter?.();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (accountId) headers['X-Account-Id'] = accountId;

    const response = await fetch(
      `${httpClient.baseUrl}/inbound-receipts/${encodeURIComponent(id)}/document`,
      { headers },
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Download failed' }));
      const apiError: any = new Error(error.message || `HTTP ${response.status}`);
      apiError.status = response.status;
      throw apiError;
    }
    return response.blob();
  },

  /** `expenseId` is the client id the expense was created with. */
  confirmInboundReceipt(id: string, expenseId: string) {
    return httpClient.request<void>(`/inbound-receipts/${encodeURIComponent(id)}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ expenseId }),
    });
  },

  dismissInboundReceipt(id: string) {
    return httpClient.request<void>(`/inbound-receipts/${encodeURIComponent(id)}/dismiss`, {
      method: 'POST',
    });
  },

  retryInboundReceipt(id: string) {
    return httpClient.request<InboundReceiptDetail>(`/inbound-receipts/${encodeURIComponent(id)}/retry`, {
      method: 'POST',
    });
  },
};
