import { httpClient } from './http-client';

export const budgetsApi = {
  getBudgets() {
    return httpClient.request<any[]>('/budgets');
  },

  createBudget(data: any) {
    return httpClient.request<any>('/budgets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateBudget(id: string, data: any) {
    return httpClient.request<any>(`/budgets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteBudget(id: string) {
    return httpClient.request<void>(`/budgets/${id}`, { method: 'DELETE' });
  },

  getBudgetProgress(id: string) {
    return httpClient.request<any>(`/budgets/${id}/progress`);
  },

  getBudgetHistory(id: string, periods = 6) {
    return httpClient.request<any[]>(`/budgets/${id}/history?periods=${periods}`);
  },
};
