import { httpClient } from './http-client';
import type { UpsertUtilityReadingRequest, UtilityReading, UtilitySummary } from '@budget/shared-types';

/**
 * Utility bill readings (`/utilities`, docs/contracts/utility-bill-readings.md). Online only,
 * like vehicles: no SQLite mirror. Expense ids may be the device id; the server resolves them.
 */
export const utilitiesApi = {
  getUtilitySummary(property?: string): Promise<UtilitySummary> {
    const qs = property ? `?property=${encodeURIComponent(property)}` : '';
    return httpClient.request<UtilitySummary>(`/utilities/summary${qs}`);
  },

  getUtilityReading(expenseId: string): Promise<UtilityReading | null> {
    return httpClient.request<UtilityReading | null>(`/utilities/readings/${encodeURIComponent(expenseId)}`);
  },

  upsertUtilityReading(expenseId: string, data: UpsertUtilityReadingRequest): Promise<UtilityReading> {
    return httpClient.request<UtilityReading>(`/utilities/readings/${encodeURIComponent(expenseId)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteUtilityReading(expenseId: string): Promise<{ success: boolean }> {
    return httpClient.request<{ success: boolean }>(`/utilities/readings/${encodeURIComponent(expenseId)}`, {
      method: 'DELETE',
    });
  },
};
