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
    } catch {
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
    } catch {
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

    let response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...fetchOptions,
      headers,
    });

    // Handle token expiration
    if (response.status === 401 && !skipAuth) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        const newToken = await this.getAuthToken();
        if (newToken) {
          (headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
        }
        response = await fetch(`${this.baseUrl}${endpoint}`, {
          ...fetchOptions,
          headers,
        });
      } else {
        // Logout user if refresh fails
        useAuthStore.getState().logout();
        throw new Error('Session expired');
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      const message = Array.isArray(error.message)
        ? error.message.join('\n')
        : error.message || `HTTP ${response.status}`;
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

  // Analytics endpoints
  async getAnalyticsSummary(startDate: string, endDate: string) {
    return this.request<any>(`/analytics/summary?startDate=${startDate}&endDate=${endDate}`);
  }

  async getAnalyticsTrends(startDate: string, endDate: string) {
    return this.request<any>(`/analytics/trends?startDate=${startDate}&endDate=${endDate}`);
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
