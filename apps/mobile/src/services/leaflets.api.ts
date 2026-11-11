import { httpClient } from './http-client';
import type {
  CreateLeafletRequest,
  LeafletBudget,
  LeafletPageRequest,
  LeafletPageResult,
  LeafletPdfRequest,
  LeafletResult,
} from '@budget/shared-types';

/**
 * Gazetka match (`/leaflets`). Error codes the callers branch on, read from `ApiError.code`:
 * `EMPTY_BASKET` (422) and `ENCRYPTED_ACCOUNT` (403) on create and the first read,
 * `LEAFLET_LIMIT` (403) and `PAGE_CAP` (409) on a page, `PDF_TOO_LARGE` (413) on a PDF.
 */
export const leafletsApi = {
  createLeaflet(dto: CreateLeafletRequest) {
    return httpClient.request<{ id: string }>('/leaflets', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  getLeafletBudget() {
    return httpClient.request<LeafletBudget>('/leaflets/budget');
  },

  getActiveLeaflets() {
    return httpClient.request<LeafletResult[]>('/leaflets');
  },

  getLeaflet(id: string) {
    return httpClient.request<LeafletResult>(`/leaflets/${id}`);
  },

  readLeafletPage(id: string, dto: LeafletPageRequest) {
    return httpClient.request<LeafletPageResult>(`/leaflets/${id}/pages`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  /** Starts a background read and answers at once; poll `getLeaflet` until `status !== 'reading'`. */
  uploadLeafletPdf(id: string, dto: LeafletPdfRequest) {
    return httpClient.request<{ id: string }>(`/leaflets/${id}/pdf`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  markLeafletItemAdded(itemId: string) {
    return httpClient.request<void>(`/leaflets/items/${itemId}/added`, { method: 'POST' });
  },

  /** The community promo push was opened; `pushKey` comes from the push's data. */
  markLeafletPushOpened(pushKey: string) {
    return httpClient.request<void>('/leaflets/push-opened', {
      method: 'POST',
      body: JSON.stringify({ pushKey }),
    });
  },
};
