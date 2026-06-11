import { httpClient } from './http-client';
import type { AnomalyAlertListResponse } from '@budget/shared-types';

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
};
