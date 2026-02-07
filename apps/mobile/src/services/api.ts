import { secureStorage } from './secureStorage';
import { useAuthStore } from '@/stores/authStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async getAuthToken(): Promise<string | null> {
    try {
      return await secureStorage.getItem('accessToken');
    } catch (e) {
      console.error('[API] getAuthToken error');
      return null;
    }
  }

  private async refreshToken(): Promise<boolean> {
    try {
      const refreshToken = await secureStorage.getItem('refreshToken');
      if (!refreshToken) return false;

      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      await secureStorage.setItem('accessToken', data.accessToken);
      if (data.refreshToken) {
        await secureStorage.setItem('refreshToken', data.refreshToken);
      }
      return true;
    } catch (e) {
      console.error('[API] Token refresh failed');
      return false;
    }
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { skipAuth = false, ...fetchOptions } = options;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (!skipAuth) {
      const token = await this.getAuthToken();
      if (token) {
        (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
      }
    }

    const url = `${this.baseUrl}${endpoint}`;
    console.log(`[API] ${options.method || 'GET'} ${url} (skipAuth: ${skipAuth})`);

    let response: Response;
    try {
      response = await fetch(url, {
        ...fetchOptions,
        headers,
      });
    } catch (e) {
      console.log('[API] Network error:', e);
      throw e;
    }

    console.log(`[API] Response: ${response.status} ${response.statusText}`);

    // Handle token expiration
    if (response.status === 401 && !skipAuth) {
      console.log('[API] Got 401, attempting token refresh...');
      const refreshed = await this.refreshToken();
      if (refreshed) {
        const newToken = await this.getAuthToken();
        if (newToken) {
          (headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
        }
        response = await fetch(url, {
          ...fetchOptions,
          headers,
        });
        console.log(`[API] Retry response: ${response.status}`);
      } else {
        // Refresh failed — clear dead tokens so biometric login won't reuse them
        console.log('[API] Token refresh failed, clearing tokens and logging out');
        await secureStorage.removeItem('accessToken');
        await secureStorage.removeItem('refreshToken');
        useAuthStore.getState().logout();
        throw new Error('Session expired');
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      const message = Array.isArray(error.message)
        ? error.message.join('\n')
        : error.message || `HTTP ${response.status}`;
      console.log(`[API] Error response:`, message);
      throw new Error(message);
    }

    return response.json();
  }

  // Auth endpoints
  async login(email: string, password: string) {
    return this.request<{ accessToken: string; refreshToken: string; user: any }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        skipAuth: true,
      },
    );
  }

  async register(email: string, password: string, name: string, currencyCode?: string) {
    return this.request<{ accessToken: string; refreshToken: string; user: any }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, name, currencyCode }),
        skipAuth: true,
      },
    );
  }

  // User endpoints
  async getProfile() {
    return this.request<any>('/users/me');
  }

  async updateProfile(data: { name?: string; currencyCode?: string; timezone?: string }) {
    return this.request<any>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Expense endpoints
  async getExpenses(filters?: { startDate?: string; endDate?: string; categoryId?: string }) {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.categoryId) params.append('categoryId', filters.categoryId);
    const query = params.toString();
    return this.request<any[]>(`/expenses${query ? `?${query}` : ''}`);
  }

  async createExpense(data: any) {
    return this.request<any>('/expenses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateExpense(id: string, data: any) {
    return this.request<any>(`/expenses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteExpense(id: string) {
    return this.request<void>(`/expenses/${id}`, { method: 'DELETE' });
  }

  // Budget endpoints
  async getBudgets() {
    return this.request<any[]>('/budgets');
  }

  async createBudget(data: any) {
    return this.request<any>('/budgets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getBudgetProgress(id: string) {
    return this.request<any>(`/budgets/${id}/progress`);
  }

  // Category endpoints
  async getCategories() {
    return this.request<any[]>('/categories');
  }

  // AI endpoints
  async transcribeAudio(audioBase64: string, language?: string) {
    return this.request<{ text: string; language: string; duration: number }>(
      '/ai/transcribe',
      {
        method: 'POST',
        body: JSON.stringify({ audio: audioBase64, language }),
      },
    );
  }

  async parseExpense(text: string) {
    return this.request<{
      amount: number;
      currencyCode: string;
      description: string;
      categoryId?: string;
      categorySuggestion: string;
      confidence: number;
      merchant?: string;
    }>('/ai/parse-expense', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }

  async chat(message: string, conversationId?: string) {
    return this.request<{ message: string; conversationId: string }>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message, conversationId }),
    });
  }

  async scanReceipt(imageBase64: string) {
    return this.request<{
      amount: number;
      currencyCode: string;
      description: string;
      categoryId: string | null;
      categorySuggestion: string | null;
      merchant: string | null;
      date: string | null;
      confidence: number;
      receiptItems: Array<{
        description: string;
        quantity?: number;
        unitPrice?: number;
        totalPrice: number;
      }>;
    }>('/ai/scan-receipt', {
      method: 'POST',
      body: JSON.stringify({ imageBase64 }),
    });
  }

  async extractTextFromImage(imageBase64: string) {
    return this.request<{ text: string }>('/ai/extract-text', {
      method: 'POST',
      body: JSON.stringify({ imageBase64 }),
    });
  }

  // Expense Items endpoints
  async getExpenseItems(expenseId: string) {
    return this.request<any[]>(`/expenses/${expenseId}/items`);
  }

  async createExpenseItem(expenseId: string, data: any) {
    return this.request<any>(`/expenses/${expenseId}/items`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateExpenseItem(expenseId: string, itemId: string, data: any) {
    return this.request<any>(`/expenses/${expenseId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteExpenseItem(expenseId: string, itemId: string) {
    return this.request<void>(`/expenses/${expenseId}/items/${itemId}`, {
      method: 'DELETE',
    });
  }

  // Receipt Image endpoints
  async getReceiptImage(expenseId: string) {
    return this.request<{ imageBase64: string }>(`/expenses/${expenseId}/receipt-image`);
  }

  async saveReceiptImage(expenseId: string, imageBase64: string) {
    return this.request<{ success: boolean }>(`/expenses/${expenseId}/receipt-image`, {
      method: 'PUT',
      body: JSON.stringify({ imageBase64 }),
    });
  }

  async deleteReceiptImage(expenseId: string) {
    return this.request<{ success: boolean }>(`/expenses/${expenseId}/receipt-image`, {
      method: 'DELETE',
    });
  }

  // Analytics endpoints
  async getAnalyticsSummary(startDate: string, endDate: string) {
    return this.request<any>(`/analytics/summary?startDate=${startDate}&endDate=${endDate}`);
  }

  async getAnalyticsTrends(startDate: string, endDate: string) {
    return this.request<any>(`/analytics/trends?startDate=${startDate}&endDate=${endDate}`);
  }

  async getAnalyticsItemBreakdown(startDate: string, endDate: string) {
    return this.request<any[]>(`/analytics/items?startDate=${startDate}&endDate=${endDate}`);
  }

  // Sync endpoints
  async pushChanges(changes: any[]) {
    return this.request<any>('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ changes }),
    });
  }

  async pullChanges(since: string) {
    return this.request<any>(`/sync/pull?since=${since}`);
  }
}

export const api = new ApiClient(API_BASE_URL);
