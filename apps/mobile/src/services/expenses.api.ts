import type { Expense, ExpenseItem, ExpenseCategorySplit } from '@budget/shared-types';
import type { CreateExpenseDto, UpdateExpenseDto } from '@budget/shared-types';
import type { PaginatedResponse } from '@budget/shared-types';
import { httpClient } from './http-client';

/** Accepts UpdateExpenseDto with date as string or Date (JSON.stringify normalises both). */
type UpdateExpenseInput = Omit<UpdateExpenseDto, 'date' | 'debtDueDate'> & {
  date?: string | Date;
  debtDueDate?: string | Date | null;
  [key: string]: unknown;
};

export const expensesApi = {
  getExpenses(filters?: { startDate?: string; endDate?: string; categoryId?: string }) {
    const params = new URLSearchParams();
    params.append('limit', '10000');
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.categoryId) params.append('categoryId', filters.categoryId);
    return httpClient.request<PaginatedResponse<Expense>>(`/expenses?${params.toString()}`);
  },

  createExpense(data: CreateExpenseDto) {
    return httpClient.request<Expense>('/expenses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateExpense(id: string, data: UpdateExpenseInput) {
    return httpClient.request<Expense>(`/expenses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteExpense(id: string) {
    return httpClient.request<void>(`/expenses/${id}`, { method: 'DELETE' });
  },

  bulkUpdateExpenses(data: { ids: string[]; categoryId?: string | null; tagIds?: string[]; isDeleted?: boolean }) {
    return httpClient.request<{ updated: number }>('/expenses/bulk', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  stopRecurringExpense(id: string) {
    return httpClient.request<{ id: string; isRecurring: boolean }>(`/expenses/${id}/stop-recurring`, {
      method: 'PATCH',
    });
  },

  getExpenseItems(expenseId: string) {
    return httpClient.request<ExpenseItem[]>(`/expenses/${expenseId}/items`);
  },

  createExpenseItem(expenseId: string, data: { description: string; quantity: number; unitPrice: number; sortOrder?: number }) {
    return httpClient.request<ExpenseItem>(`/expenses/${expenseId}/items`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateExpenseItem(expenseId: string, itemId: string, data: { description?: string; quantity?: number; unitPrice?: number; sortOrder?: number }) {
    return httpClient.request<ExpenseItem>(`/expenses/${expenseId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteExpenseItem(expenseId: string, itemId: string) {
    return httpClient.request<void>(`/expenses/${expenseId}/items/${itemId}`, {
      method: 'DELETE',
    });
  },

  getReceiptImage(expenseId: string) {
    return httpClient.request<{ imageBase64: string; mimeType?: string }>(
      `/expenses/${expenseId}/receipt-image`,
    );
  },

  saveReceiptImage(expenseId: string, imageBase64: string, mimeType?: string) {
    return httpClient.request<{ success: boolean }>(`/expenses/${expenseId}/receipt-image`, {
      method: 'PUT',
      body: JSON.stringify({ imageBase64, mimeType }),
    });
  },

  deleteReceiptImage(expenseId: string) {
    return httpClient.request<{ success: boolean }>(`/expenses/${expenseId}/receipt-image`, {
      method: 'DELETE',
    });
  },

  setExpenseSplits(
    expenseId: string,
    splits: { categoryId: string; amount: number; percentage: number; notes?: string }[],
  ) {
    return httpClient.request<ExpenseCategorySplit[]>(`/expenses/${expenseId}/splits`, {
      method: 'POST',
      body: JSON.stringify({ splits }),
    });
  },

  removeExpenseSplits(expenseId: string) {
    return httpClient.request<void>(`/expenses/${expenseId}/splits`, { method: 'DELETE' });
  },
};
