import type {
  SubscriptionDto,
  UsageStatsDto,
  CheckoutSessionResponse,
  PortalSessionResponse,
  PlansResponse,
  AdminDashboardResponse,
  WiseImportPreviewResponse,
  WiseImportCommitDto,
  WiseImportCommitResponse,
} from '@budget/shared-types';
import { httpClient } from './http-client';

export const subscriptionsApi = {
  getPlans() {
    return httpClient.request<PlansResponse>('/subscriptions/plans');
  },

  getCurrentSubscription() {
    return httpClient.request<SubscriptionDto>('/subscriptions/current');
  },

  getUsageStats() {
    return httpClient.request<UsageStatsDto>('/subscriptions/usage');
  },

  getUsageDetails(month?: number, year?: number) {
    const params = new URLSearchParams();
    if (month) params.set('month', String(month));
    if (year) params.set('year', String(year));
    const query = params.toString();
    return httpClient.request<{
      month: number;
      year: number;
      totalCost: number;
      totalRequests: number;
      summary: Array<{ feature: string; count: number; totalCost: number }>;
      logs: Array<{ id: string; feature: string; cost: number; date: string }>;
    }>(`/subscriptions/usage/details${query ? `?${query}` : ''}`);
  },

  createCheckoutSession(priceId: string, successUrl: string, cancelUrl: string) {
    return httpClient.request<CheckoutSessionResponse>('/subscriptions/checkout', {
      method: 'POST',
      body: JSON.stringify({ priceId, successUrl, cancelUrl }),
    });
  },

  createPortalSession(returnUrl: string) {
    return httpClient.request<PortalSessionResponse>('/subscriptions/portal', {
      method: 'POST',
      body: JSON.stringify({ returnUrl }),
    });
  },

  pushChanges(changes: any[]) {
    return httpClient.request<any>('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ changes }),
    });
  },

  pullChanges(since: string) {
    return httpClient.request<any>(`/sync/pull?since=${since}`);
  },

  getGamificationProfile() {
    return httpClient.request<any>('/gamification/profile');
  },

  checkAchievements() {
    return httpClient.request<any>('/gamification/check', { method: 'POST' });
  },

  getAchievementDefinitions() {
    return httpClient.request<any[]>('/gamification/definitions');
  },

  getAdminDashboard(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const query = params.toString();
    return httpClient.request<AdminDashboardResponse>(
      `/admin/dashboard${query ? `?${query}` : ''}`,
    );
  },

  async importWisePreview(
    file: { uri: string; name: string; type: string },
  ): Promise<WiseImportPreviewResponse> {
    const form = new FormData();
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as any);

    const token = await httpClient.getAuthToken();
    const accountId = httpClient.accountIdGetter?.();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (accountId) headers['X-Account-Id'] = accountId;

    const url = `${httpClient.baseUrl}/import/wise/preview`;
    let response = await fetch(url, { method: 'POST', headers, body: form });

    if (response.status === 401) {
      const refreshed = await httpClient.refreshToken();
      if (refreshed) {
        const newToken = await httpClient.getAuthToken();
        if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(url, { method: 'POST', headers, body: form });
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
  },

  importWiseCommit(payload: WiseImportCommitDto): Promise<WiseImportCommitResponse> {
    return httpClient.request<WiseImportCommitResponse>('/import/wise/commit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getProjects(includeArchived?: boolean) {
    const params = includeArchived ? '?archived=true' : '';
    return httpClient.request<any[]>(`/projects${params}`);
  },

  getProject(id: string) {
    return httpClient.request<any>(`/projects/${id}`);
  },

  createProject(data: any) {
    return httpClient.request<any>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateProject(id: string, data: any) {
    return httpClient.request<any>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteProject(id: string) {
    return httpClient.request<void>(`/projects/${id}`, { method: 'DELETE' });
  },

  addExpenseToProject(projectId: string, expenseId: string) {
    return httpClient.request<any>(`/projects/${projectId}/expenses`, {
      method: 'POST',
      body: JSON.stringify({ expenseId }),
    });
  },

  removeExpenseFromProject(projectId: string, expenseId: string) {
    return httpClient.request<void>(`/projects/${projectId}/expenses/${expenseId}`, {
      method: 'DELETE',
    });
  },

  getProjectAnalytics(projectId: string) {
    return httpClient.request<any>(`/projects/${projectId}/analytics`);
  },
};
