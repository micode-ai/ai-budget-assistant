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

  // Savings Goals
  'POST /ai/goals': {
    body: import('../dto').CreateGoalDto;
    response: import('../dto').GoalPlanResponse;
  };
  'GET /ai/goals': {
    response: import('../entities').SavingsGoal[];
  };
  'GET /ai/goals/:id': {
    params: { id: string };
    response: import('../entities').SavingsGoal;
  };
  'GET /ai/goals/:id/progress': {
    params: { id: string };
    response: import('../dto').GoalProgressResponse;
  };
  'PATCH /ai/goals/:id': {
    params: { id: string };
    body: import('../dto').UpdateGoalDto;
    response: import('../entities').SavingsGoal;
  };
  'DELETE /ai/goals/:id': {
    params: { id: string };
    response: { success: boolean };
  };
  'POST /ai/goals/:id/regenerate-plan': {
    params: { id: string };
    response: import('../dto').GoalPlanResponse;
  };

  // Fat Finder
  'POST /insights/fat-finder': {
    body: import('../dto').GenerateFatFinderRequest;
    response: import('../dto').FatFinderResponse;
  };

  // Insights
  'GET /insights': {
    response: import('../dto').InsightsResponse;
  };

  // E2EE
  'POST /encryption/setup': {
    body: import('../dto').SetupEncryptionDto;
    response: { success: boolean };
  };
  'GET /encryption/profile': {
    response: import('../dto').EncryptionProfileResponse;
  };
  'POST /encryption/account/:id/enable': {
    params: { id: string };
    body: import('../dto').EnableAccountEncryptionDto;
    response: { success: boolean };
  };
  'GET /encryption/account/:id/key': {
    params: { id: string };
    response: import('../dto').AccountEncryptionKeyResponse;
  };
  'POST /encryption/account/:id/grant-key': {
    params: { id: string };
    body: import('../dto').GrantKeyDto;
    response: { success: boolean };
  };
  'GET /encryption/account/:id/pending-grants': {
    params: { id: string };
    response: import('../dto').PendingKeyGrantsResponse;
  };
  'POST /encryption/account/:id/rotate-key': {
    params: { id: string };
    body: import('../dto').RotateAccountKeyDto;
    response: { success: boolean };
  };
  'POST /encryption/recovery/setup': {
    body: import('../dto').SetupRecoveryDto;
    response: { success: boolean };
  };
  'POST /encryption/recovery/recover': {
    body: import('../dto').RecoverEncryptionDto;
    response: import('../dto').RecoverEncryptionResponse;
  };
  'GET /encryption/account/:id/status': {
    params: { id: string };
    response: import('../dto').AccountEncryptionStatusResponse;
  };
  'GET /encryption/members/:id/public-keys': {
    params: { id: string };
    response: import('../dto').MemberPublicKeyResponse;
  };

  // Wise Import
  'POST /import/wise/preview': {
    body: FormData;
    response: import('../dto').WiseImportPreviewResponse;
  };
  'POST /import/wise/commit': {
    body: import('../dto').WiseImportCommitDto;
    response: import('../dto').WiseImportCommitResponse;
  };

  // Bank Import
  'POST /import/bank/preview': {
    response: import('../dto').BankImportPreviewResponse;
  };
  'POST /import/bank/commit': {
    body: import('../dto').BankImportCommitDto;
    response: import('../dto').BankImportCommitResponse;
  };
  'GET /import/bank/mappings': {
    response: import('../dto').CsvImportMapping[];
  };
  'POST /import/bank/mappings': {
    body: import('../dto').CreateCsvImportMappingDto;
    response: import('../dto').CsvImportMapping;
  };
  'DELETE /import/bank/mappings/:id': {
    response: void;
  };
}
