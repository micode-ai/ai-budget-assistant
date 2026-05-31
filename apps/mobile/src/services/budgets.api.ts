import type { Budget, BudgetProgress, BudgetHistoryEntry } from '@budget/shared-types';
import type { CreateBudgetDto, UpdateBudgetDto } from '@budget/shared-types';
import { httpClient } from './http-client';

export const budgetsApi = {
  getBudgets() {
    return httpClient.request<Budget[]>('/budgets');
  },

  createBudget(data: CreateBudgetDto) {
    return httpClient.request<Budget>('/budgets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateBudget(id: string, data: UpdateBudgetDto) {
    return httpClient.request<Budget>(`/budgets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteBudget(id: string) {
    return httpClient.request<void>(`/budgets/${id}`, { method: 'DELETE' });
  },

  getBudgetProgress(id: string) {
    return httpClient.request<BudgetProgress>(`/budgets/${id}/progress`);
  },

  getBudgetHistory(id: string, periods = 6) {
    return httpClient.request<BudgetHistoryEntry[]>(`/budgets/${id}/history?periods=${periods}`);
  },
};
