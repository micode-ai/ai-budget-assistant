import { httpClient } from './http-client';
import type { AnomalyAlertListResponse, AnomalySuppression, PriceCheckSummary } from '@budget/shared-types';

export const alertsApi = {
  listAlerts() {
    return httpClient.request<AnomalyAlertListResponse>('/alerts');
  },

  markAlertRead(id: string) {
    return httpClient.request<{ success: boolean; updated: number }>(`/alerts/${id}/read`, { method: 'PATCH' });
  },

  markAllAlertsRead() {
    return httpClient.request<{ success: boolean; updated: number }>('/alerts/read-all', { method: 'PATCH' });
  },

  dismissAlert(id: string) {
    return httpClient.request<{ success: boolean; updated: number }>(`/alerts/${id}`, { method: 'DELETE' });
  },

  markAlertNormal(id: string) {
    return httpClient.request<{ success: boolean }>(`/alerts/${id}/normal`, { method: 'POST' });
  },

  listAlertSuppressions() {
    return httpClient.request<AnomalySuppression[]>('/alerts/suppressions');
  },

  removeAlertSuppression(id: string) {
    return httpClient.request<{ success: boolean }>(`/alerts/suppressions/${id}`, { method: 'DELETE' });
  },

  getPriceCheckSummary() {
    return httpClient.request<PriceCheckSummary>('/alerts/price-check-summary');
  },
};
