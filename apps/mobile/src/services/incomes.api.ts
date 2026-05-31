import type { Income } from '@budget/shared-types';
import type { CreateIncomeDto, UpdateIncomeDto } from '@budget/shared-types';
import type { PaginatedResponse } from '@budget/shared-types';
import { httpClient } from './http-client';

/** Accepts UpdateIncomeDto with date as string or Date (JSON.stringify normalises both). */
type UpdateIncomeInput = Omit<UpdateIncomeDto, 'date' | 'debtDueDate'> & {
  date?: string | Date;
  debtDueDate?: string | Date | null;
  [key: string]: unknown;
};

export const incomesApi = {
  getIncomes(filters?: { startDate?: string; endDate?: string; categoryId?: string }) {
    const params = new URLSearchParams();
    params.append('limit', '10000');
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.categoryId) params.append('categoryId', filters.categoryId);
    return httpClient.request<PaginatedResponse<Income>>(`/incomes?${params.toString()}`);
  },

  createIncome(data: CreateIncomeDto) {
    return httpClient.request<Income>('/incomes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateIncome(id: string, data: UpdateIncomeInput) {
    return httpClient.request<Income>(`/incomes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteIncome(id: string) {
    return httpClient.request<void>(`/incomes/${id}`, { method: 'DELETE' });
  },
};
