// Data Transfer Objects for API communication

import type { Currency, ExpenseSource, BudgetPeriod, CategoryType, AccountType, AccountRole, Account, SubscriptionTier, SubscriptionStatus, DrillDownLevel, ChartConfig, AIInsightChart, SpendingStory, AssetType, InvestmentTransactionType, PortfolioSummary, PortfolioPerformance, EncryptionTier, KeyWrappingMethod, PendingKeyGrant, DebtSummary, AppPlatform } from '../entities';

// Auth DTOs
export interface RegisterDto {
  email: string;
  password: string;
  name: string;
  currencyCode?: Currency;
  timezone?: string;
  referralCode?: string;
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

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  email: string;
  code: string;
  newPassword: string;
}

export interface MessageResponse {
  message: string;
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
  isDebt?: boolean;
  isDebtRepayment?: boolean;
  debtContactName?: string;
  debtDueDate?: string;
  relatedDebtIncomeId?: string;
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
  isDebt?: boolean;
  isDebtRepayment?: boolean;
  debtContactName?: string | null;
  debtDueDate?: string | null;
  relatedDebtIncomeId?: string | null;
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
  isDebt?: boolean;
  isDebtRepayment?: boolean;
  debtContactName?: string;
  debtDueDate?: string;
  relatedDebtExpenseId?: string;
}

export interface UpdateIncomeDto {
  amount?: number;
  currencyCode?: Currency;
  description?: string;
  notes?: string;
  categoryId?: string;
  date?: string;
  isDebt?: boolean;
  isDebtRepayment?: boolean;
  debtContactName?: string | null;
  debtDueDate?: string | null;
  relatedDebtExpenseId?: string | null;
}

// Budget DTOs
export interface BudgetCategoryAllocationDto {
  categoryId: string;
  amount: number;
}

export interface CreateBudgetDto {
  localId: string;
  name: string;
  amount: number;
  currencyCode: Currency;
  period: BudgetPeriod;
  startDate: string;
  endDate?: string;
  categories?: BudgetCategoryAllocationDto[];
  alertThreshold?: number | null;
}

export interface UpdateBudgetDto {
  name?: string;
  amount?: number;
  currencyCode?: Currency;
  period?: BudgetPeriod;
  endDate?: string | null;
  categories?: BudgetCategoryAllocationDto[];
  alertThreshold?: number | null;
  isActive?: boolean;
}

export interface BudgetHistoryEntry {
  periodStart: string;
  periodEnd: string;
  limit: number;
  actual: number;
  isOverBudget: boolean;
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
  encryptedPayload?: string;
  encryptionKeyVersion?: number;
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
  pendingAction?: ChatPendingAction;
  actionResult?: ChatActionResult;
  suggestedActions?: Array<{
    type: 'set_budget' | 'view_chart' | 'add_expense';
    data: Record<string, unknown>;
  }>;
}

// ── Chat Action Types ──

export type ChatActionType =
  | 'create_expense'
  | 'create_income'
  | 'create_budget'
  | 'create_category'
  | 'get_expenses'
  | 'get_budget_status'
  | 'get_category_breakdown'
  | 'record_debt_repayment'
  | 'create_debt'
  | 'get_debt_summary'
  | 'update_goal_balance';

export interface CreateExpenseActionData {
  amount: number;
  currencyCode: Currency;
  description: string;
  categoryName?: string;
  date: string;
  tagNames?: string[];
  projectName?: string;
}

export interface CreateIncomeActionData {
  amount: number;
  currencyCode: Currency;
  description: string;
  categoryName?: string;
  date: string;
}

export interface CreateBudgetActionData {
  name: string;
  amount: number;
  currencyCode: Currency;
  period: BudgetPeriod;
  categoryName?: string;
  startDate: string;
  endDate?: string;
}

export interface GetExpensesActionData {
  startDate: string;
  endDate: string;
  categoryName?: string;
}

export interface GetBudgetStatusActionData {
  budgetName?: string;
  categoryName?: string;
}

export interface GetCategoryBreakdownActionData {
  startDate: string;
  endDate: string;
}

export interface CreateCategoryActionData {
  name: string;
  type: 'expense' | 'income';
}

export interface RecordDebtRepaymentActionData {
  debtId: string;
  amount: number;
  date?: string;
}

export interface CreateDebtActionData {
  contactName: string;
  amount: number;
  currencyCode: Currency;
  direction: 'lent' | 'borrowed';
  dueDate?: string;
}

export interface GetDebtSummaryActionData {
  // No parameters needed
}

export interface UpdateGoalBalanceActionData {
  goalId: string;
  newAmount: number;
}

export type ChatActionData =
  | CreateExpenseActionData
  | CreateIncomeActionData
  | CreateBudgetActionData
  | CreateCategoryActionData
  | GetExpensesActionData
  | GetBudgetStatusActionData
  | GetCategoryBreakdownActionData
  | RecordDebtRepaymentActionData
  | CreateDebtActionData
  | GetDebtSummaryActionData
  | UpdateGoalBalanceActionData;

export interface ChatPendingAction {
  id: string;
  actionType: ChatActionType;
  data: ChatActionData;
  displaySummary: string;
}

export interface ChatActionResult {
  actionType: ChatActionType;
  success: boolean;
  data?: Record<string, unknown>;
  errorMessage?: string;
}

export interface ChatConfirmActionRequest {
  conversationId: string;
  actionId: string;
}

export interface ChatRejectActionRequest {
  conversationId: string;
  actionId: string;
  reason?: string;
}

// ── Shared Chat DTOs ──

export interface ChatMention {
  userId: string;
}

export interface SendChatRequest {
  message: string;
  conversationId?: string;
  mentions?: ChatMention[];
  isShared?: boolean;
}

export interface SendChatResponse {
  message: string;
  conversationId: string;
  aiResponded: boolean;
  userMessageId: string;
  userMessageCreatedAt: string;
  assistantMessageId?: string;
  assistantCreatedAt?: string;
  pendingAction?: ChatPendingAction;
  actionResult?: ChatActionResult;
  encryptionRestricted?: boolean;
}

export interface ChatConversationSummary {
  id: string;
  title: string | null;
  isShared: boolean;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageResponse {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  senderUserId: string | null;
  senderName: string | null;
  mentionedUserIds: string[];
  tokensUsed: number | null;
  createdAt: string;
}

export interface SetConversationSharedRequest {
  isShared: boolean;
}

// Savings Goal DTOs
export interface CreateGoalDto {
  name: string;
  targetAmount: number;
  currencyCode: Currency;
  deadline: string; // ISO date
}

export interface UpdateGoalDto {
  name?: string;
  targetAmount?: number;
  deadline?: string;
  currentAmount?: number;
  status?: import('../entities').GoalStatus;
}

export interface GoalPlanResponse {
  goal: import('../entities').SavingsGoal;
  plan: import('../entities').GoalPlan;
}

export interface GoalProgressResponse {
  goal: import('../entities').SavingsGoal;
  percentComplete: number;
  onTrack: boolean;
  projectedCompletionDate: string;
  monthlyNeeded: number;
  behindByAmount: number;
}

// Fat Finder DTOs
export interface FatFinderResponse {
  report: import('../entities').FatFinderReport;
  isStale: boolean;
}

export interface GenerateFatFinderRequest {
  forceRegenerate?: boolean;
  language?: string;
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
    vsAverage?: number | null;
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
  debtReminders?: boolean;
}

export interface NotificationPreferencesResponse {
  budgetAlerts: boolean;
  sharedAccountActivity: boolean;
  debtReminders: boolean;
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
  bonusAiRequests?: number;
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
  countAsIncome?: boolean;
}

export interface UpdateAccountTransferDto {
  fromAmount?: number;
  toAmount?: number;
  exchangeRate?: number;
  date?: string;
  notes?: string;
  countAsIncome?: boolean;
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
  countAsIncome: boolean;
  linkedIncomeId?: string;
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
  locale?: string;
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

// E2EE DTOs

export interface SetupEncryptionDto {
  pbkdf2Salt: string;
  publicKeyX25519: string;
  publicKeyEd25519: string;
  wrappedPrivateKeyX25519: string;
  wrappedPrivateKeyEd25519: string;
}

export interface EncryptionProfileResponse {
  pbkdf2Salt: string;
  publicKeyX25519: string;
  publicKeyEd25519: string;
  wrappedPrivateKeyX25519: string;
  wrappedPrivateKeyEd25519: string;
  keyVersion: number;
  recoveryConfigured: boolean;
}

export interface EnableAccountEncryptionDto {
  tier: 1 | 2;
  wrappedAccountKey: string;
}

export interface AccountEncryptionKeyResponse {
  wrappedAccountKey: string;
  wrappedBy: string;
  wrappingMethod: KeyWrappingMethod;
  keyVersion: number;
}

export interface GrantKeyDto {
  targetUserId: string;
  wrappedAccountKey: string;
  wrappingMethod: KeyWrappingMethod;
}

export interface PendingKeyGrantsResponse {
  pending: PendingKeyGrant[];
}

export interface RotateAccountKeyDto {
  newWrappedKeys: Array<{
    userId: string;
    wrappedAccountKey: string;
  }>;
}

export interface SetupRecoveryDto {
  recoveryKeyPlaintext: string;
  wrappedMasterKeyByRecovery: string;
}

export interface RecoverEncryptionDto {
  recoveryKey: string;
}

export interface RecoverEncryptionResponse {
  wrappedMasterKeyByRecovery: string;
  pbkdf2Salt: string;
  publicKeyX25519: string;
  publicKeyEd25519: string;
  wrappedPrivateKeyX25519: string;
  wrappedPrivateKeyEd25519: string;
}

export interface MemberPublicKeyResponse {
  members: Array<{
    userId: string;
    publicKeyX25519: string;
  }>;
}

export interface AccountEncryptionStatusResponse {
  encryptionEnabled: boolean;
  encryptionTier: EncryptionTier;
  keyVersion: number;
  keyRotationNeeded: boolean;
}

// Report & Export DTOs

export interface GenerateReportDto {
  format: 'csv' | 'pdf' | 'excel';
  startDate: string;
  endDate: string;
  categoryIds?: string[];
  tagIds?: string[];
  projectIds?: string[];
  currencyCode?: string;
  includeIncomes?: boolean;
  includeExpenses?: boolean;
  locale?: string;
}

export interface GenerateReportResponse {
  reportId: string;
  status: 'completed';
  downloadUrl: string;
  fileName: string;
  fileSize: number;
}

export interface ReportListItem {
  id: string;
  format: string;
  status: string;
  fileName: string;
  fileSize?: number;
  createdAt: string;
  expiresAt: string;
}

export interface ReportListResponse {
  reports: ReportListItem[];
}

export interface MonthlyDigestResponse {
  digest: {
    periodLabel: string;
    currencyCode: string;
    totalIncome: number;
    totalExpenses: number;
    savingsRate: number;
    topCategories: Array<{ categoryId: string | null; name: string; amount: number; percentage: number }>;
    incomeChange: number;
    expenseChange: number;
  };
  generatedAt: string;
}

export interface CreateBackupResponse {
  backupId: string;
  fileName: string;
  fileSize: number;
  entityCounts: Record<string, number>;
  encrypted: boolean;
}

export interface RestoreBackupDto {
  data: string;
  overwrite: boolean;
}

export interface RestoreBackupResponse {
  restoredCounts: Record<string, number>;
  skippedCounts: Record<string, number>;
  errors: string[];
}

export interface BackupHistoryItem {
  id: string;
  version: number;
  entityCounts: Record<string, number>;
  encrypted: boolean;
  fileSize: number;
  createdAt: string;
}

export interface UpdateReportPreferencesDto {
  weeklyEmailEnabled?: boolean;
  weeklyEmailDay?: number;
  monthlyDigestEnabled?: boolean;
}

export interface ReportPreferencesResponse {
  weeklyEmailEnabled: boolean;
  weeklyEmailDay: number;
  monthlyDigestEnabled: boolean;
}

// Debt DTOs
export interface DebtSummaryResponse {
  lent: DebtSummary[];
  borrowed: DebtSummary[];
  totals: {
    totalLent: number;
    totalBorrowed: number;
    totalLentRemaining: number;
    totalBorrowedRemaining: number;
    currencyCode: string;
  };
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

// ── Telegram DTOs ──

export interface TelegramLinkCodeResponse {
  code: string;
  expiresAt: string;
  botUsername: string;
}

export interface TelegramLinkStatusResponse {
  linked: boolean;
  telegramUsername?: string;
  linkedAt?: string;
}

// Referral DTOs
export interface ReferralStatsDto {
  referralCode: string;
  totalReferrals: number;
  qualifiedReferrals: number;
  pendingReferrals: number;
  bonusAiRequests: number;
  nextMilestone: { count: number; reward: string } | null;
}

export interface ReferralListItemDto {
  id: string;
  referredName: string;
  status: 'pending' | 'qualified' | 'expired';
  createdAt: string;
  qualifiedAt: string | null;
}

// App version DTOs
export interface AppVersionCheckResponse {
  latestVersion: string;
  minSupportedVersion: string;
  isUpdateAvailable: boolean;
  isUpdateRequired: boolean;
  releaseNotes: Record<string, string> | null;
  storeUrl: string;
}

export interface CreateAppVersionDto {
  platform: AppPlatform;
  latestVersion: string;
  minSupportedVersion: string;
  releaseNotes?: Record<string, string>;
  storeUrl: string;
  publishedAt?: string;
}

export type UpdateAppVersionDto = Partial<CreateAppVersionDto>;

// Wise CSV Import DTOs

export type WiseImportRowKind = 'expense' | 'income' | 'fx';

export interface WiseImportRow {
  idx: number;
  kind: WiseImportRowKind;
  date: string;
  amount: number;
  currencyCode: string;
  description: string;
  merchant?: string;
  externalRef: string;
  suggestedCategoryName?: string;
  alreadyImported: boolean;
  fxFromCurrency?: string;
  fxFromAmount?: number;
  fxToCurrency?: string;
  fxToAmount?: number;
  fxRate?: number;
}

export interface WiseImportPreviewResponse {
  totalRows: number;
  importable: number;
  skipped: number;
  rows: WiseImportRow[];
}

export interface WiseImportCommitDto {
  rows: WiseImportRow[];
}

export interface WiseImportCommitResponse {
  createdExpenses: number;
  createdIncomes: number;
  createdExchanges: number;
}

// Bank Import — neutral type aliases reused by Wise + Polish parsers

export type ImportRowKind = WiseImportRowKind;
export type ImportRow = WiseImportRow;
export type ImportPreviewResponse = WiseImportPreviewResponse;

// Bank Import — new types

export interface BankParserDescriptor {
  id: 'mbank' | 'pko' | 'ing' | 'millennium' | 'pekao' | 'erste' | 'alior' | 'universal';
  displayName: string;
}

export type AmountColumnMapping = string | { debit: string; credit: string };

export interface ColumnMapping {
  date: string;
  amount: AmountColumnMapping;
  description: string;
  currency?: string;
  counterparty?: string;
}

export type BankImportPreviewStatus = 'parsed' | 'needs_mapping' | 'needs_picker';

export interface BankImportPreviewResponse {
  status: BankImportPreviewStatus;
  detectedBankId?: BankParserDescriptor['id'];
  totalRows?: number;
  importable?: number;
  skipped?: number;
  parseErrors?: number;
  rows?: ImportRow[];
  headers?: string[];
  sampleRows?: string[][];
  headerFingerprint?: string;
  supportedBanks?: BankParserDescriptor[];
}

export interface BankImportCommitDto {
  rows: ImportRow[];
  saveMapping?: { name: string };
  bankId?: BankParserDescriptor['id'];
  headerFingerprint?: string;
  mapping?: ColumnMapping;
  delimiter?: string;
  encoding?: string;
  amountFormat?: 'polish' | 'standard';
  dateFormat?: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
}

export interface BankImportCommitResponse {
  createdExpenses: number;
  createdIncomes: number;
  createdExchanges: number;
  skippedDuplicates: number;
  parseErrors: number;
  savedMappingId?: string;
}

export interface CsvImportMapping {
  id: string;
  accountId: string;
  name: string;
  headerFingerprint: string;
  bankId: string | null;
  mapping: ColumnMapping;
  delimiter: string;
  encoding: string;
  amountFormat: 'polish' | 'standard';
  dateFormat: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
  createdAt: string;
  updatedAt: string;
}

export interface CreateCsvImportMappingDto {
  name: string;
  headerFingerprint: string;
  bankId?: string;
  mapping: ColumnMapping;
  delimiter?: string;
  encoding?: string;
  amountFormat?: 'polish' | 'standard';
  dateFormat?: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
}
