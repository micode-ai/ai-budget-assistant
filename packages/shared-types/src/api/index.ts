// API contracts and response types

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
  details?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface ExpenseFilters extends PaginationParams {
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
  source?: string;
}

export interface BudgetFilters extends PaginationParams {
  isActive?: boolean;
  categoryId?: string;
  period?: string;
}

// API endpoints type definitions
export interface ApiEndpoints {
  // Auth
  'POST /auth/register': {
    body: import('../dto').RegisterDto;
    response: import('../dto').AuthResponse;
  };
  'POST /auth/login': {
    body: import('../dto').LoginDto;
    response: import('../dto').AuthResponse;
  };
  'POST /auth/refresh': {
    body: { refreshToken: string };
    response: { accessToken: string };
  };

  // Expenses
  'GET /expenses': {
    query: ExpenseFilters;
    response: PaginatedResponse<import('../entities').Expense>;
  };
  'POST /expenses': {
    body: import('../dto').CreateExpenseDto;
    response: import('../entities').Expense;
  };
  'PATCH /expenses/:id': {
    params: { id: string };
    body: import('../dto').UpdateExpenseDto;
    response: import('../entities').Expense;
  };
  'DELETE /expenses/:id': {
    params: { id: string };
    response: { success: boolean };
  };

  // Budgets
  'GET /budgets': {
    query: BudgetFilters;
    response: PaginatedResponse<import('../entities').Budget>;
  };
  'POST /budgets': {
    body: import('../dto').CreateBudgetDto;
    response: import('../entities').Budget;
  };
  'GET /budgets/:id/progress': {
    params: { id: string };
    response: import('../entities').BudgetProgress;
  };

  // Sync
  'POST /sync/push': {
    body: import('../dto').SyncPushRequest;
    response: import('../dto').SyncPushResponse;
  };
  'GET /sync/pull': {
    query: { since: string };
    response: import('../dto').SyncPullResponse;
  };

  // AI
  'POST /ai/transcribe': {
    body: FormData;
    response: import('../dto').TranscribeResponse;
  };
  'POST /ai/parse-expense': {
    body: import('../dto').ParseExpenseRequest;
    response: import('../dto').ParseExpenseResponse;
  };
  'POST /ai/chat': {
    body: import('../dto').ChatRequest;
    response: import('../dto').ChatResponse;
  };

  // Analytics
  'GET /analytics/summary': {
    query: { startDate: string; endDate: string };
    response: import('../dto').AnalyticsSummary;
  };

  // Investments
  'GET /investments/assets/search': {
    query: { q: string; type?: string };
    response: import('../dto').AssetSearchResponse;
  };
  'GET /investments/holdings': {
    response: import('../entities').PortfolioHolding[];
  };
  'POST /investments/holdings': {
    body: import('../dto').CreatePortfolioHoldingDto;
    response: import('../entities').PortfolioHolding;
  };
  'DELETE /investments/holdings/:id': {
    params: { id: string };
    response: { success: boolean };
  };
  'GET /investments/transactions': {
    query: { holdingId?: string };
    response: import('../entities').InvestmentTransaction[];
  };
  'POST /investments/transactions': {
    body: import('../dto').CreateInvestmentTransactionDto;
    response: import('../entities').InvestmentTransaction;
  };
  'PATCH /investments/transactions/:id': {
    params: { id: string };
    body: import('../dto').UpdateInvestmentTransactionDto;
    response: import('../entities').InvestmentTransaction;
  };
  'DELETE /investments/transactions/:id': {
    params: { id: string };
    response: { success: boolean };
  };
  'GET /investments/summary': {
    response: import('../dto').PortfolioSummaryResponse;
  };
  'POST /investments/analytics': {
    body: import('../dto').PortfolioAnalyticsRequest;
    response: import('../dto').PortfolioAnalyticsResponse;
  };
  'POST /investments/refresh-prices': {
    response: { success: boolean };
  };
}
