import { secureStorage } from './secureStorage';
import type { Account, AccountMember, AccountInvitation } from '@budget/shared-types';
import type { CreateAccountDto, UpdateAccountDto, CreateInvitationDto, SubscriptionDto, UsageStatsDto, CheckoutSessionResponse, PortalSessionResponse, PlansResponse, AdminDashboardResponse, DrillDownRequest, DrillDownResponse, AIInsightsResponse, StoryDashboardResponse } from '@budget/shared-types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

class ApiClient {
  private baseUrl: string;
  private accountIdGetter: (() => string | null) | null = null;
  private logoutHandler: (() => void) | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setAccountIdGetter(getter: () => string | null) {
    this.accountIdGetter = getter;
  }

  setLogoutHandler(handler: () => void) {
    this.logoutHandler = handler;
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

      // Inject account context
      const accountId = this.accountIdGetter?.();
      if (accountId) {
        (headers as Record<string, string>)['X-Account-Id'] = accountId;
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
        this.logoutHandler?.();
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
    return this.request<{ accessToken: string; refreshToken: string; user: any; accounts: Account[] }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        skipAuth: true,
      },
    );
  }

  async register(email: string, password: string, name: string, currencyCode?: string) {
    return this.request<{ accessToken: string; refreshToken: string; user: any; accounts: Account[] }>(
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

  // Income endpoints
  async getIncomes(filters?: { startDate?: string; endDate?: string; categoryId?: string }) {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.categoryId) params.append('categoryId', filters.categoryId);
    const query = params.toString();
    return this.request<any[]>(`/incomes${query ? `?${query}` : ''}`);
  }

  async createIncome(data: any) {
    return this.request<any>('/incomes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateIncome(id: string, data: any) {
    return this.request<any>(`/incomes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteIncome(id: string) {
    return this.request<void>(`/incomes/${id}`, { method: 'DELETE' });
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

  async updateBudget(id: string, data: any) {
    return this.request<any>(`/budgets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteBudget(id: string) {
    return this.request<void>(`/budgets/${id}`, { method: 'DELETE' });
  }

  async getBudgetProgress(id: string) {
    return this.request<any>(`/budgets/${id}/progress`);
  }

  // Category endpoints
  async getCategories() {
    return this.request<any[]>('/categories');
  }

  async createCategory(data: { name: string; icon?: string; color?: string; type: string; parentId?: string }) {
    return this.request<any>('/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Tags
  async getTags() {
    return this.request<any[]>('/tags');
  }

  async createTag(data: { name: string; color?: string; icon?: string }) {
    return this.request<any>('/tags', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTag(id: string, data: { name?: string; color?: string; icon?: string }) {
    return this.request<any>(`/tags/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteTag(id: string) {
    return this.request<void>(`/tags/${id}`, { method: 'DELETE' });
  }

  async suggestTags(description: string, merchant?: string) {
    const params = new URLSearchParams({ description });
    if (merchant) params.append('merchant', merchant);
    return this.request<any>(`/ai/suggest-tags?${params.toString()}`);
  }

  // Projects
  async getProjects(includeArchived?: boolean) {
    const params = includeArchived ? '?archived=true' : '';
    return this.request<any[]>(`/projects${params}`);
  }

  async getProject(id: string) {
    return this.request<any>(`/projects/${id}`);
  }

  async createProject(data: any) {
    return this.request<any>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProject(id: string, data: any) {
    return this.request<any>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: string) {
    return this.request<void>(`/projects/${id}`, { method: 'DELETE' });
  }

  async addExpenseToProject(projectId: string, expenseId: string) {
    return this.request<any>(`/projects/${projectId}/expenses`, {
      method: 'POST',
      body: JSON.stringify({ expenseId }),
    });
  }

  async removeExpenseFromProject(projectId: string, expenseId: string) {
    return this.request<void>(`/projects/${projectId}/expenses/${expenseId}`, { method: 'DELETE' });
  }

  async getProjectAnalytics(projectId: string) {
    return this.request<any>(`/projects/${projectId}/analytics`);
  }

  async suggestProject(data: { description: string; date: string; locationName?: string }) {
    return this.request<any>('/ai/suggest-project', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Splits
  async setExpenseSplits(expenseId: string, splits: Array<{ categoryId: string; amount: number; percentage: number; notes?: string }>) {
    return this.request<any>(`/expenses/${expenseId}/splits`, {
      method: 'POST',
      body: JSON.stringify({ splits }),
    });
  }

  async removeExpenseSplits(expenseId: string) {
    return this.request<void>(`/expenses/${expenseId}/splits`, { method: 'DELETE' });
  }

  async suggestSplits(data: { id: string; description: string; amount: number; items?: Array<{ description: string; totalPrice: number }> }) {
    return this.request<any>('/ai/suggest-splits', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Enhanced analytics
  async getAnalyticsByTag(startDate: string, endDate: string) {
    return this.request<any>(`/analytics/by-tag?startDate=${startDate}&endDate=${endDate}`);
  }

  async getAnalyticsByProject() {
    return this.request<any>('/analytics/by-project');
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

  async scanReceipt(imageBase64: string, userPrompt?: string) {
    return this.request<{
      amount: number;
      discountAmount: number | null;
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
      body: JSON.stringify({ imageBase64, ...(userPrompt ? { userPrompt } : {}) }),
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

  // Account endpoints
  async getAccounts() {
    return this.request<Account[]>('/accounts');
  }

  async createAccount(dto: CreateAccountDto) {
    return this.request<Account>('/accounts', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  async updateAccount(id: string, dto: UpdateAccountDto) {
    return this.request<Account>(`/accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  }

  async deleteAccount(id: string) {
    return this.request<void>(`/accounts/${id}`, { method: 'DELETE' });
  }

  async getMembers(accountId: string) {
    return this.request<AccountMember[]>(`/accounts/${accountId}/members`);
  }

  async updateMemberRole(accountId: string, memberId: string, role: string) {
    return this.request<AccountMember>(`/accounts/${accountId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }

  async removeMember(accountId: string, memberId: string) {
    return this.request<void>(`/accounts/${accountId}/members/${memberId}`, {
      method: 'DELETE',
    });
  }

  async leaveAccount(accountId: string) {
    return this.request<void>(`/accounts/${accountId}/leave`, { method: 'POST' });
  }

  async createInvitation(accountId: string, dto: CreateInvitationDto) {
    return this.request<AccountInvitation>(`/accounts/${accountId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  async getInvitations(accountId: string) {
    return this.request<AccountInvitation[]>(`/accounts/${accountId}/invitations`);
  }

  async cancelInvitation(accountId: string, invitationId: string) {
    return this.request<void>(`/accounts/${accountId}/invitations/${invitationId}`, {
      method: 'DELETE',
    });
  }

  async acceptInvitation(inviteCode: string) {
    return this.request<any>('/accounts/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  }

  async declineInvitation(inviteCode: string) {
    return this.request<any>('/accounts/invitations/decline', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  }

  // Wallet endpoints
  async getWalletBalances() {
    return this.request<any[]>('/wallet');
  }

  async getWalletSummary() {
    return this.request<any>('/wallet/summary');
  }

  async setWalletBalance(data: { localId: string; currencyCode: string; initialAmount: number }) {
    return this.request<any>('/wallet', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteWalletBalance(currencyCode: string) {
    return this.request<void>(`/wallet/${currencyCode}`, { method: 'DELETE' });
  }

  // Currency Exchange endpoints
  async getCurrencyExchanges(filters?: { startDate?: string; endDate?: string }) {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    const query = params.toString();
    return this.request<any[]>(`/currency-exchanges${query ? `?${query}` : ''}`);
  }

  async createCurrencyExchange(data: any) {
    return this.request<any>('/currency-exchanges', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteCurrencyExchange(id: string) {
    return this.request<void>(`/currency-exchanges/${id}`, { method: 'DELETE' });
  }

  async getExchangeRates(baseCurrency: string = 'USD') {
    return this.request<{ base: string; rates: Record<string, number>; updatedAt: string }>(
      `/currency-exchanges/rates?base=${baseCurrency}`,
    );
  }

  // Account Transfer endpoints (user-scoped, no X-Account-Id needed)
  async getAccountTransfers() {
    return this.request<any[]>('/account-transfers');
  }

  async createAccountTransfer(data: any) {
    return this.request<any>('/account-transfers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteAccountTransfer(id: string) {
    return this.request<void>(`/account-transfers/${id}`, { method: 'DELETE' });
  }

  // Insights endpoints
  async getInsights() {
    return this.request<{
      anomalies: Array<{
        categoryId: string;
        categoryName: string;
        currentAmount: number;
        averageAmount: number;
        percentageChange: number;
        period: string;
      }>;
      predictions: Array<{
        budgetId: string;
        budgetName: string;
        estimatedExhaustionDate?: string;
        dailyBurnRate: number;
        daysRemaining: number;
        projectedTotal: number;
        currencyCode: string;
      }>;
    }>('/insights');
  }

  async suggestCategory(description: string) {
    return this.request<{
      categoryId?: string;
      categoryName: string;
      confidence: number;
      source: 'history' | 'ai';
    }>(`/ai/suggest-category?description=${encodeURIComponent(description)}`);
  }

  // Push Notification endpoints
  async updatePushToken(token: string | null) {
    return this.request<{ success: boolean }>('/users/me/push-token', {
      method: 'PATCH',
      body: JSON.stringify({ pushToken: token }),
    });
  }

  async getNotificationPreferences() {
    return this.request<{ budgetAlerts: boolean; sharedAccountActivity: boolean }>(
      '/users/me/notification-preferences',
    );
  }

  async updateNotificationPreferences(prefs: { budgetAlerts?: boolean; sharedAccountActivity?: boolean }) {
    return this.request<{ budgetAlerts: boolean; sharedAccountActivity: boolean }>(
      '/users/me/notification-preferences',
      {
        method: 'PATCH',
        body: JSON.stringify(prefs),
      },
    );
  }
  // Subscription endpoints
  async getPlans() {
    return this.request<PlansResponse>('/subscriptions/plans');
  }

  async getCurrentSubscription() {
    return this.request<SubscriptionDto>('/subscriptions/current');
  }

  async getUsageStats() {
    return this.request<UsageStatsDto>('/subscriptions/usage');
  }

  async createCheckoutSession(priceId: string, successUrl: string, cancelUrl: string) {
    return this.request<CheckoutSessionResponse>('/subscriptions/checkout', {
      method: 'POST',
      body: JSON.stringify({ priceId, successUrl, cancelUrl }),
    });
  }

  async createPortalSession(returnUrl: string) {
    return this.request<PortalSessionResponse>('/subscriptions/portal', {
      method: 'POST',
      body: JSON.stringify({ returnUrl }),
    });
  }

  // Drill-Down Analytics
  async drillDown(request: DrillDownRequest) {
    return this.request<DrillDownResponse>('/analytics/drill-down', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // AI Insights
  async getAIInsights(language?: string) {
    const params = language ? `?language=${language}` : '';
    return this.request<AIInsightsResponse>(`/insights/ai-charts${params}`);
  }

  // Story Dashboard
  async getSpendingStory(period: 'week' | 'month', forceRegenerate?: boolean, language?: string) {
    return this.request<StoryDashboardResponse>('/insights/story', {
      method: 'POST',
      body: JSON.stringify({ period, forceRegenerate, language }),
    });
  }

  // Gamification endpoints
  async getGamificationProfile() {
    return this.request<any>('/gamification/profile');
  }

  async checkAchievements() {
    return this.request<any>('/gamification/check', { method: 'POST' });
  }

  async getAchievementDefinitions() {
    return this.request<any[]>('/gamification/definitions');
  }

  // Investment endpoints
  async searchAssets(query: string) {
    return this.request<Array<{ symbol: string; name: string; type: string; exchange: string; currency: string }>>(
      `/investments/assets/search?q=${encodeURIComponent(query)}`,
    );
  }

  async getPortfolioHoldings() {
    return this.request<any[]>('/investments/holdings');
  }

  async createPortfolioHolding(data: any) {
    return this.request<any>('/investments/holdings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  async removePortfolioHolding(id: string) {
    return this.request<{ success: boolean }>(`/investments/holdings/${id}`, { method: 'DELETE' });
  }

  async getInvestmentTransactions(holdingId?: string) {
    const params = holdingId ? `?holdingId=${holdingId}` : '';
    return this.request<any[]>(`/investments/transactions${params}`);
  }

  async createInvestmentTransaction(data: any) {
    return this.request<any>('/investments/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  async updateInvestmentTransaction(id: string, data: any) {
    return this.request<any>(`/investments/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  async deleteInvestmentTransaction(id: string) {
    return this.request<{ success: boolean }>(`/investments/transactions/${id}`, { method: 'DELETE' });
  }

  async getPortfolioSummary() {
    return this.request<any>('/investments/summary');
  }

  async getPortfolioAnalytics(period: string, benchmark?: string) {
    return this.request<any>('/investments/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period, benchmark }),
    });
  }

  async getAssetPriceHistory(holdingId: string, days: number = 30) {
    return this.request<{ dates: string[]; prices: number[] }>(
      `/investments/holdings/${holdingId}/price-history?days=${days}`,
    );
  }

  async refreshInvestmentPrices() {
    return this.request<{ success: boolean }>('/investments/refresh-prices', { method: 'POST' });
  }

  // Admin endpoints
  async getAdminDashboard(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const query = params.toString();
    return this.request<AdminDashboardResponse>(
      `/admin/dashboard${query ? `?${query}` : ''}`,
    );
  }
}

export const api = new ApiClient(API_BASE_URL);
