import { httpClient } from './http-client';

export const incomesApi = {
  getIncomes(filters?: { startDate?: string; endDate?: string; categoryId?: string }) {
    const params = new URLSearchParams();
    params.append('limit', '10000');
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.categoryId) params.append('categoryId', filters.categoryId);
    return httpClient.request<any[]>(`/incomes?${params.toString()}`);
  },

  createIncome(data: any) {
    return httpClient.request<any>('/incomes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateIncome(id: string, data: any) {
    return httpClient.request<any>(`/incomes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteIncome(id: string) {
    return httpClient.request<void>(`/incomes/${id}`, { method: 'DELETE' });
  },
};
