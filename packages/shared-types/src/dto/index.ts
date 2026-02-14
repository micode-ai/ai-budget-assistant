// Data Transfer Objects for API communication

import type { Currency, ExpenseSource, BudgetPeriod, CategoryType, AccountType, AccountRole, Account, SubscriptionTier, SubscriptionStatus, DrillDownLevel, ChartConfig, AIInsightChart, SpendingStory, AssetType, InvestmentTransactionType, PortfolioSummary, PortfolioPerformance } from '../entities';

// Auth DTOs
export interface RegisterDto {
  email: string;
  password: string;
  name: string;
  currencyCode?: Currency;
  timezone?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    currencyCode: Currency;
    defaultAccountId?: string;
  };
  accounts: Account[];
}

// Expense DTOs
export interface CreateExpenseDto {
  localId: string;
  amount: number;
  discountAmount?: number;
  currencyCode: Currency;
  description?: string;
  notes?: string;
  categoryId?: string;
  date: string; // ISO string
  time?: string;
  location?: {
    lat: number;
    lng: number;
    name?: string;
  };
  source: ExpenseSource;
  tagIds?: string[];
  projectId?: string;
}

export interface UpdateExpenseDto {
  amount?: number;
  discountAmount?: number;
  currencyCode?: Currency;
  description?: string;
  notes?: string;
  categoryId?: string;
  date?: string;
  time?: string;
  location?: {
    lat: number;
    lng: number;
    name?: string;
  } | null;
  tagIds?: string[];
  projectId?: string | null;
}

// Income DTOs
export interface CreateIncomeDto {
  localId: string;
  amount: number;
  currencyCode: Currency;
  description?: string;
  notes?: string;
  categoryId?: string;
  date: string; // ISO string
  tagIds?: string[];
  projectId?: string;
}

export interface UpdateIncomeDto {
  amount?: number;
  currencyCode?: Currency;
  description?: string;
  notes?: string;
  categoryId?: string;
  date?: string;
}

// Budget DTOs
export interface CreateBudgetDto {
  localId: string;
  name: string;
  amount: number;
  currencyCode: Currency;
  period: BudgetPeriod;
  startDate: string;
  endDate?: string;
  categoryId?: string;
  alertThreshold?: number;
}

export interface UpdateBudgetDto {
  name?: string;
  amount?: number;
  currencyCode?: Currency;
  period?: BudgetPeriod;
  endDate?: string | null;
  categoryId?: string | null;
  alertThreshold?: number;
  isActive?: boolean;
}

// Category DTOs
export interface CreateCategoryDto {
  name: string;
  icon?: string;
  color?: string;
  type: CategoryType;
  parentId?: string;
}

export interface UpdateCategoryDto {
  name?: string;
  icon?: string;
  color?: string;
  parentId?: string | null;
}

// Tag DTOs
export interface CreateTagDto {
  name: string;
  color?: string;
  icon?: string;
}

export interface UpdateTagDto {
  name?: string;
  color?: string | null;
  icon?: string | null;
}

export interface TagSuggestionResponse {
  tags: Array<{
    name: string;
    confidence: number;
    source: 'history' | 'ai';
    existingTagId?: string;
  }>;
}

// Project DTOs
export interface CreateProjectDto {
  localId: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  currencyCode?: Currency;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  budget?: number | null;
  currencyCode?: Currency | null;
  isArchived?: boolean;
}

export interface ProjectAnalyticsResponse {
  projectId: string;
  projectName: string;
  totalExpenses: number;
  totalIncome: number;
  netAmount: number;
  expenseCount: number;
  incomeCount: number;
  budgetRemaining?: number;
  expensesByCategory: Array<{
    categoryId: string;
    categoryName: string;
    amount: number;
    percentage: number;
  }>;
  timeline: Array<{
    date: string;
    expenses: number;
    income: number;
  }>;
}

// Expense Category Split DTOs
export interface CreateExpenseCategorySplitDto {
  categoryId: string;
  amount: number;
  percentage: number;
  notes?: string;
}

export interface SetExpenseSplitsDto {
  splits: CreateExpenseCategorySplitDto[];
}

export interface SplitSuggestionResponse {
  shouldSplit: boolean;
  confidence: number;
  suggestedSplits?: Array<{
    categoryId?: string;
    categoryName: string;
    amount: number;
    percentage: number;
    reasoning: string;
  }>;
}

// Account DTOs
export interface CreateAccountDto {
  name: string;
  type: AccountType;
  currencyCode?: Currency;
  icon?: string;
}

export interface UpdateAccountDto {
  name?: string;
  currencyCode?: Currency;
  icon?: string;
}

export interface CreateInvitationDto {
  email?: string;
  role?: AccountRole;
  expiresInDays?: number;
}

export interface AcceptInvitationDto {
  inviteCode: string;
}

export interface UpdateMemberRoleDto {
  role: AccountRole;
}

// Sync DTOs
export type SyncOperation = 'create' | 'update' | 'delete';

export type SyncEntityType = 'expense' | 'budget' | 'category' | 'walletBalance' | 'currencyExchange' | 'income' | 'tag' | 'expense_tag' | 'income_tag' | 'project' | 'project_expense' | 'project_income' | 'expense_category_split' | 'portfolio_holding' | 'investment_transaction';

export interface SyncChange<T = unknown> {
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  payload: T;
  clientVersion: number;
  accountId: string;
}

export interface SyncPushRequest {
  changes: SyncChange[];
  lastSyncTimestamp?: string;
  accountId: string;
}

export interface SyncResult {
  entityId: string;
  status: 'success' | 'conflict' | 'error';
  serverVersion?: number;
  serverId?: string;
  serverData?: unknown;
  error?: string;
}

export interface SyncPushResponse {
  results: SyncResult[];
  serverTimestamp: string;
  summary: {
    success: number;
    conflicts: number;
    errors: number;
  };
}

export interface SyncPullResponse {
  changes: Array<{
    entityType: SyncEntityType;
    entityId: string;
    operation: SyncOperation;
    data: unknown;
    version: number;
    timestamp: string;
  }>;
  serverTimestamp: string;
}

// AI DTOs
export interface TranscribeRequest {
  // Audio is sent as form-data
  language?: string;
}

export interface TranscribeResponse {
  text: string;
  language: string;
  duration: number;
}

export interface ParseExpenseRequest {
  text: string;
  language?: string;
}

export interface ParseExpenseResponse {
  amount: number;
  currencyCode: Currency;
  description: string;
  categoryId?: string;
  categorySuggestion?: string;
  confidence: number;
  merchant?: string;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
}

export interface ChatResponse {
  message: string;
  conversationId: string;
  suggestedActions?: Array<{
    type: 'set_budget' | 'view_chart' | 'add_expense';
    data: Record<string, unknown>;
  }>;
}

// Analytics DTOs
export interface AnalyticsSummary {
  period: {
    start: string;
    end: string;
  };
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  expensesByCategory: Array<{
    categoryId: string;
    categoryName: string;
    amount: number;
    percentage: number;
    count: number;
  }>;
  topExpenses: Array<{
    id: string;
    description: string;
    amount: number;
    date: string;
    categoryName: string;
  }>;
  totalDiscountSavings: number;
  trends: {
    vsLastPeriod: number; // percentage change
    vsAverage: number;
  };
}

// Insights DTOs
export interface InsightsResponse {
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
}

export interface CategorySuggestionResponse {
  categoryId?: string;
  categoryName: string;
  confidence: number;
  source: 'history' | 'ai';
}

// Notification DTOs
export interface UpdatePushTokenDto {
  pushToken: string | null;
}

export interface UpdateNotificationPreferencesDto {
  budgetAlerts?: boolean;
  sharedAccountActivity?: boolean;
}

export interface NotificationPreferencesResponse {
  budgetAlerts: boolean;
  sharedAccountActivity: boolean;
}

// Subscription DTOs
export interface SubscriptionDto {
  id: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  trialStart?: string;
  trialEnd?: string;
}

export interface UsageStatsDto {
  tier: SubscriptionTier;
  aiRequestsUsed: number;
  aiRequestsLimit: number;
  resetAt: string;
  percentUsed: number;
  isTrialing?: boolean;
}

export interface CreateCheckoutSessionDto {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResponse {
  sessionId: string;
  url: string;
}

export interface PortalSessionResponse {
  url: string;
}

export interface PlanPriceDto {
  amount: number;
  display: string;
  priceEnvKey: string;
}

export interface PlanDto {
  tier: 'pro' | 'business';
  name: string;
  monthly: PlanPriceDto;
  yearly: PlanPriceDto;
  monthlyEquivalent: string;
  features: string[];
}

export interface PlansResponse {
  currency: string;
  symbol: string;
  plans: PlanDto[];
}

// Wallet DTOs
export interface CreateWalletBalanceDto {
  localId: string;
  currencyCode: Currency;
  initialAmount: number;
}

export interface UpdateWalletBalanceDto {
  initialAmount?: number;
}

// Currency Exchange DTOs
export interface CreateCurrencyExchangeDto {
  localId: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  fromAmount: number;
  toAmount: number;
  exchangeRate: number;
  date: string;
  notes?: string;
}

export interface UpdateCurrencyExchangeDto {
  fromAmount?: number;
  toAmount?: number;
  exchangeRate?: number;
  date?: string;
  notes?: string;
}

// Account Transfer DTOs
export interface CreateAccountTransferDto {
  localId: string;
  fromAccountId: string;
  fromCurrency: Currency;
  fromAmount: number;
  toAccountId: string;
  toCurrency: Currency;
  toAmount: number;
  exchangeRate: number;
  date: string;
  notes?: string;
}

export interface AccountTransferResponse {
  id: string;
  clientId: string;
  userId: string;
  fromAccountId: string;
  fromCurrency: string;
  fromAmount: number;
  toAccountId: string;
  toCurrency: string;
  toAmount: number;
  exchangeRate: number;
  date: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Wallet summary response
export interface WalletSummaryResponse {
  balances: Array<{
    currencyCode: Currency;
    initialAmount: number;
    totalIncomes: number;
    totalExpenses: number;
    totalExchangedIn: number;
    totalExchangedOut: number;
    totalTransferredIn: number;
    totalTransferredOut: number;
    currentBalance: number;
  }>;
}

// Exchange rates response
export interface ExchangeRatesResponse {
  base: Currency;
  rates: Partial<Record<Currency, number>>;
  updatedAt: string;
}

// Drill-Down DTOs
export interface DrillDownRequest {
  level: DrillDownLevel;
  parentId?: string;
  startDate: string;
  endDate: string;
  currencyCode?: string;
}

export interface DrillDownResponse {
  chart: ChartConfig;
  transactions?: Array<{
    id: string;
    description: string;
    amount: number;
    date: string;
    categoryName: string;
    currencyCode: string;
  }>;
  breadcrumb: Array<{
    level: DrillDownLevel;
    label: string;
    id?: string;
  }>;
}

// AI Insights DTOs
export interface AIInsightsResponse {
  insights: AIInsightChart[];
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
}

// Story Dashboard DTOs
export interface GenerateStoryRequest {
  period: 'week' | 'month';
  forceRegenerate?: boolean;
}

export interface StoryDashboardResponse {
  story: SpendingStory;
  isStale: boolean;
}

// Gamification DTOs

export interface GamificationProfileResponse {
  totalXp: number;
  level: number;
  levelProgress: number;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate?: string;
  achievements: Array<{
    achievementId: string;
    isCompleted: boolean;
    progress: number;
    unlockedAt?: string;
  }>;
  recentBadges: Array<{
    achievementId: string;
    unlockedAt: string;
  }>;
}

export interface CheckAchievementsResponse {
  newlyUnlocked: Array<{
    achievementId: string;
    unlockedAt: string;
  }>;
  updatedProgress: Array<{
    achievementId: string;
    progress: number;
  }>;
  streakUpdated: boolean;
  currentStreak: number;
}

// Investment DTOs

export interface AssetSearchResult {
  symbol: string;
  name: string;
  type: AssetType;
  exchange: string;
  currency: string;
}

export interface AssetSearchResponse {
  results: AssetSearchResult[];
}

export interface CreatePortfolioHoldingDto {
  localId: string;
  assetSymbol: string;
  assetName: string;
  assetType: AssetType;
  assetExchange?: string;
  notes?: string;
}

export interface CreateInvestmentTransactionDto {
  localId: string;
  holdingId: string;
  type: InvestmentTransactionType;
  quantity: number;
  pricePerUnit: number;
  fee?: number;
  date: string; // ISO string
  notes?: string;
}

export interface UpdateInvestmentTransactionDto {
  quantity?: number;
  pricePerUnit?: number;
  fee?: number;
  date?: string;
  notes?: string;
}

export interface PortfolioSummaryResponse {
  summary: PortfolioSummary;
  lastPriceUpdate: string;
}

export interface PortfolioAnalyticsRequest {
  period: 'week' | 'month' | 'quarter' | 'year' | 'all';
  benchmark?: string;
}

export interface PortfolioAnalyticsResponse {
  performance: PortfolioPerformance;
  allocation: Array<{
    assetType: AssetType;
    value: number;
    percentage: number;
  }>;
  topGainers: Array<{ symbol: string; pnlPercent: number }>;
  topLosers: Array<{ symbol: string; pnlPercent: number }>;
}

// Admin DTOs
export interface AdminUserUsageItem {
  userId: string;
  userName: string;
  userEmail: string;
  tier: SubscriptionTier;
  totalCostUnits: number;
  estimatedCostUsd: number;
  requestCount: number;
  byFeature: Array<{
    featureType: string;
    costUnits: number;
    estimatedCostUsd: number;
    count: number;
  }>;
}

export interface AdminDashboardResponse {
  totalUsers: number;
  totalAccounts: number;
  totalExpenses: number;
  subscriptions: {
    free: number;
    pro: number;
    business: number;
    trialing: number;
  };
  aiUsage: {
    periodStart: string;
    periodEnd: string;
    totalCostUnits: number;
    totalEstimatedCostUsd: number;
    totalRequests: number;
    users: AdminUserUsageItem[];
  };
}
