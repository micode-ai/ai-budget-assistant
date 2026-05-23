// Core domain entities

export type Currency = 'USD' | 'EUR' | 'PLN' | 'GBP' | 'UAH' | 'RUB' | 'BYN';

export type SyncStatus = 'pending' | 'synced' | 'conflict' | 'error';

export type ExpenseSource = 'manual' | 'voice' | 'ocr' | 'import';

export type BudgetPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export type CategoryType = 'income' | 'expense';

export type AccountType = 'personal' | 'business' | 'shared' | 'investment';

export type AccountRole = 'owner' | 'editor' | 'viewer';

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export type NotificationType = 'budget_alert' | 'shared_expense' | 'spending_anomaly' | 'debt_reminder' | 'recurring_expense';

export type RecurringPeriod = 'weekly' | 'monthly' | 'yearly';

export type SubscriptionTier = 'free' | 'pro' | 'business';

export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing' | 'paused';

export type InsightType = 'spending_anomaly' | 'budget_prediction' | 'saving_tip' | 'achievement';

// AI Response Mode
export type AiResponseMode = 'simple' | 'balanced' | 'expert';

// AI Model preference
export type AiModel = 'fast' | 'balanced' | 'quality';

// Savings Goal types
export type GoalStatus = 'active' | 'paused' | 'completed' | 'failed';

export interface GoalCheckpoint {
  date: string;
  targetAmount: number;
  label: string;
}

export interface GoalCategoryLimit {
  categoryName: string;
  currentMonthly: number;
  suggestedMonthly: number;
  savingsPerMonth: number;
}

export interface GoalPlan {
  monthlyContribution: number;
  weeklyContribution: number;
  checkpoints: GoalCheckpoint[];
  categoryLimits: GoalCategoryLimit[];
  estimatedCompletionDate: string;
  feasibility: 'easy' | 'moderate' | 'challenging' | 'unrealistic';
  summary: string;
}

export interface SavingsGoal {
  id: string;
  accountId: string;
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  currencyCode: Currency;
  deadline: Date;
  status: GoalStatus;
  aiPlan?: GoalPlan;
  createdAt: Date;
  updatedAt: Date;
}

// Fat Finder types
export type FatFinderFindingType = 'subscription' | 'recurring_splurge' | 'large_one_off' | 'category_excess' | 'service_overuse';

export interface FatFinderFinding {
  id: string;
  type: FatFinderFindingType;
  title: string;
  description: string;
  currentMonthly: number;
  suggestedMonthly: number;
  potentialSavings: number;
  severity: 'low' | 'medium' | 'high';
  actionSuggestion: string;
  relatedExpenses?: { description: string; amount: number; date: string }[];
}

export interface FatFinderReport {
  id: string;
  accountId: string;
  periodStart: string;
  periodEnd: string;
  findings: FatFinderFinding[];
  totalPotentialSavings: number;
  currencyCode: Currency;
  generatedAt: string;
}

// Investment types
export type AssetType = 'stock' | 'crypto' | 'etf' | 'bond' | 'commodity';

export type InvestmentTransactionType = 'buy' | 'sell';

export type DebtStatus = 'active' | 'paid' | 'overdue';

export interface NotificationPreferences {
  budgetAlerts: boolean;
  sharedAccountActivity: boolean;
  debtReminders: boolean;
  recurringExpenses: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  currencyCode: Currency;
  timezone: string;
  defaultAccountId?: string;
  isAdmin?: boolean;
  isVerified: boolean;
  aiResponseMode?: AiResponseMode;
  aiModel?: AiModel;
  createdAt: Date;
  updatedAt: Date;
  lastSyncAt?: Date;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currencyCode: Currency;
  ownerId: string;
  icon?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountMember {
  id: string;
  accountId: string;
  userId: string;
  role: AccountRole;
  joinedAt: Date;
  user?: Pick<User, 'id' | 'name' | 'email'>;
}

export interface AccountInvitation {
  id: string;
  accountId: string;
  invitedBy: string;
  invitedEmail?: string;
  inviteCode: string;
  role: AccountRole;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedBy?: string;
  createdAt: Date;
}

export interface Category {
  id: string;
  userId?: string; // null for system categories
  accountId?: string; // null for system categories
  name: string;
  icon?: string;
  color?: string;
  type: CategoryType;
  isSystem: boolean;
  parentId?: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncVersion: number;
}

export interface ExpenseItem {
  id: string;
  localId: string;
  expenseId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface Expense {
  id: string;
  localId: string;
  serverId?: string;
  userId: string;
  accountId: string;
  amount: number;
  discountAmount?: number;
  currencyCode: Currency;
  description?: string;
  notes?: string;
  categoryId?: string;
  date: Date;
  time?: string;
  location?: {
    lat: number;
    lng: number;
    name?: string;
  };
  receiptUrl?: string;
  isRecurring: boolean;
  recurringId?: string;
  recurringPeriod?: RecurringPeriod;
  source: ExpenseSource;
  externalRef?: string;
  items?: ExpenseItem[];
  receiptImageBase64?: string;
  tags?: ExpenseTag[];
  tagIds?: string[];
  categorySplits?: ExpenseCategorySplit[];
  projectId?: string;
  isDebt: boolean;
  isDebtRepayment: boolean;
  debtContactName?: string;
  debtDueDate?: Date;
  relatedDebtIncomeId?: string;
  createdByUserName?: string | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface Income {
  id: string;
  localId: string;
  serverId?: string;
  userId: string;
  accountId: string;
  amount: number;
  currencyCode: Currency;
  description?: string;
  notes?: string;
  categoryId?: string;
  date: Date;
  externalRef?: string;
  tags?: IncomeTag[];
  tagIds?: string[];
  projectId?: string;
  isDebt: boolean;
  isDebtRepayment: boolean;
  debtContactName?: string;
  debtDueDate?: Date;
  relatedDebtExpenseId?: string;
  createdByUserName?: string | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

// Tag entities

export interface Tag {
  id: string;
  accountId: string;
  name: string;
  color?: string;
  icon?: string;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface ExpenseTag {
  id: string;
  expenseId: string;
  tagId: string;
  tag?: Tag;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncVersion: number;
}

export interface IncomeTag {
  id: string;
  incomeId: string;
  tagId: string;
  tag?: Tag;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncVersion: number;
}

// Project entities

export interface Project {
  id: string;
  localId: string;
  serverId?: string;
  accountId: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  startDate?: Date;
  endDate?: Date;
  budget?: number;
  currencyCode?: Currency;
  isArchived: boolean;
  totalExpenses?: number;
  totalIncome?: number;
  expenseCount?: number;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface ProjectExpense {
  id: string;
  projectId: string;
  expenseId: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncVersion: number;
}

export interface ProjectIncome {
  id: string;
  projectId: string;
  incomeId: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncVersion: number;
}

// Expense category split

export interface ExpenseCategorySplit {
  id: string;
  expenseId: string;
  categoryId: string;
  category?: Category;
  amount: number;
  percentage: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncVersion: number;
}

export interface BudgetCategoryAllocation {
  id: string;
  budgetId: string;
  categoryId: string;
  amount: number;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncVersion: number;
}

export interface BudgetCategoryProgress {
  categoryId: string;
  categoryName: string;
  categoryColor?: string;
  allocated: number;
  spent: number;
  remaining: number;
  percentageUsed: number;
  isOverBudget: boolean;
}

export interface Budget {
  id: string;
  localId: string;
  serverId?: string;
  userId: string;
  accountId: string;
  name: string;
  amount: number;
  currencyCode: Currency;
  period: BudgetPeriod;
  startDate: Date;
  endDate?: Date;
  categoryAllocations?: BudgetCategoryAllocation[];
  alertThreshold: number | null; // percentage (0-100), null = no alerts
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface BudgetProgress {
  budget: Budget;
  spent: number;
  remaining: number;
  percentageUsed: number;
  isOverBudget: boolean;
  daysRemaining: number;
  projectedTotal: number;
  dailyBurnRate: number;
  estimatedExhaustionDate?: Date;
  categoryBreakdown?: BudgetCategoryProgress[];
}

export interface SpendingAnomaly {
  categoryId: string;
  categoryName: string;
  currentAmount: number;
  averageAmount: number;
  percentageChange: number;
  period: string;
}

export interface BudgetPrediction {
  budgetId: string;
  budgetName: string;
  estimatedExhaustionDate?: Date;
  dailyBurnRate: number;
  daysRemaining: number;
  projectedTotal: number;
  currencyCode: string;
}

export interface ChatConversation {
  id: string;
  userId: string;
  title?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokensUsed?: number;
  createdAt: Date;
}

export interface Insight {
  id: string;
  userId: string;
  type: 'warning' | 'tip' | 'achievement' | 'anomaly';
  title: string;
  message: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: Date;
}

export interface WalletBalance {
  id: string;
  localId: string;
  serverId?: string;
  accountId: string;
  userId: string;
  currencyCode: Currency;
  initialAmount: number;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface CurrencyExchange {
  id: string;
  localId: string;
  serverId?: string;
  accountId: string;
  userId: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  fromAmount: number;
  toAmount: number;
  exchangeRate: number;
  date: Date;
  notes?: string;
  externalRef?: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface AccountTransfer {
  id: string;
  localId: string;
  serverId?: string;
  userId: string;
  fromAccountId: string;
  fromCurrency: Currency;
  fromAmount: number;
  toAccountId: string;
  toCurrency: Currency;
  toAmount: number;
  exchangeRate: number;
  date: Date;
  notes?: string;
  countAsIncome: boolean;
  linkedIncomeId?: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface Subscription {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  trialStart?: Date;
  trialEnd?: Date;
  aiRequestsUsed: number;
  aiRequestsResetAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageStats {
  tier: SubscriptionTier;
  aiRequestsUsed: number;
  aiRequestsLimit: number;
  resetAt: Date;
  percentUsed: number;
}

export interface WalletSummary {
  currencyCode: Currency;
  initialAmount: number;
  totalIncomes: number;
  totalExpenses: number;
  totalExchangedIn: number;
  totalExchangedOut: number;
  totalTransferredIn: number;
  totalTransferredOut: number;
  currentBalance: number;
}

// Chart types
export type ChartType = 'bar' | 'line' | 'donut' | 'pie' | 'grouped_bar' | 'stacked_bar';

export type DrillDownLevel = 'year' | 'month' | 'week' | 'day' | 'transactions';

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
  id?: string;
  metadata?: Record<string, unknown>;
}

export interface ChartConfig {
  chartType: ChartType;
  title: string;
  subtitle?: string;
  data: ChartDataPoint[];
  drillDown?: {
    enabled: boolean;
    currentLevel: DrillDownLevel;
    nextLevel?: DrillDownLevel;
    parentId?: string;
  };
  formatting?: {
    currencyCode?: string;
    showLegend?: boolean;
    showValues?: boolean;
  };
  highlights?: Array<{
    dataIndex: number;
    type: 'anomaly' | 'peak' | 'low';
    message: string;
  }>;
}

// AI Insight types
export type InsightChartType = 'anomaly_spike' | 'category_comparison' | 'trend_change' | 'budget_burndown' | 'savings_opportunity';

// Investment AI Insight types
export type InvestmentInsightType =
  | 'concentration_risk'
  | 'sector_imbalance'
  | 'underperformer'
  | 'overperformer'
  | 'benchmark_deviation'
  | 'diversification_gap'
  | 'cost_basis_alert'
  | 'fee_impact';

export interface AIInsightChart {
  id: string;
  insightType: InsightChartType;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  chartConfig: ChartConfig;
  actionSuggestion?: string;
  generatedAt: string;
}

// Gamification types

export type AchievementCategory = 'budget' | 'tracking' | 'streak' | 'milestone' | 'savings';

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface AchievementDefinition {
  id: string;
  category: AchievementCategory;
  icon: string;
  rarity: BadgeRarity;
  threshold?: number;
  xpReward: number;
  titleKey: string;
  descriptionKey: string;
}

export interface UserAchievement {
  id: string;
  userId: string;
  accountId: string;
  achievementId: string;
  progress: number;
  isCompleted: boolean;
  unlockedAt?: Date;
  notified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserStreak {
  id: string;
  userId: string;
  accountId: string;
  streakType: string;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: Date;
  streakStartDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface GamificationProfile {
  totalXp: number;
  level: number;
  levelProgress: number;
  currentStreak: number;
  longestStreak: number;
  achievements: UserAchievement[];
  recentBadges: UserAchievement[];
}

// Story Dashboard types
export type StoryBlockType = 'hero_metric' | 'narrative_text' | 'chart' | 'comparison' | 'callout' | 'achievement';

export interface StoryBlock {
  type: StoryBlockType;
  order: number;
  content: {
    title?: string;
    text?: string;
    chartConfig?: ChartConfig;
    metrics?: Array<{ label: string; value: string; change?: number }>;
    icon?: string;
    tone?: 'positive' | 'neutral' | 'warning' | 'celebration';
  };
}

export interface SpendingStory {
  id: string;
  accountId: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  blocks: StoryBlock[];
  summary: string;
  generatedAt: string;
}

// Investment entities

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  type: AssetType;
  exchange?: string;
  currentPrice?: number;
  priceCurrency: string;
  logoUrl?: string;
  lastPriceUpdate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortfolioHolding {
  id: string;
  localId: string;
  serverId?: string;
  accountId: string;
  userId: string;
  assetId: string;
  asset?: Asset;
  quantity: number;
  averageCostBasis: number;
  totalInvested: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface InvestmentTransaction {
  id: string;
  localId: string;
  serverId?: string;
  holdingId: string;
  accountId: string;
  userId: string;
  type: InvestmentTransactionType;
  quantity: number;
  pricePerUnit: number;
  totalAmount: number;
  fee: number;
  date: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface AssetPriceHistory {
  id: string;
  assetId: string;
  date: Date;
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  volume?: number;
}

export interface PortfolioSummary {
  totalValue: number;
  totalInvested: number;
  totalPnL: number;
  totalPnLPercent: number;
  dayChange: number;
  dayChangePercent: number;
  holdings: PortfolioHoldingSummary[];
}

export interface PortfolioHoldingSummary {
  holdingId: string;
  assetId: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  quantity: number;
  averageCostBasis: number;
  currentPrice: number;
  marketValue: number;
  totalInvested: number;
  pnl: number;
  pnlPercent: number;
  dayChange: number;
  dayChangePercent: number;
  allocationPercent: number;
}

export interface PortfolioPerformance {
  dates: string[];
  values: number[];
  investedValues: number[];
  benchmarkValues?: number[];
  benchmarkName?: string;
}

// E2EE (End-to-End Encryption) types

export type EncryptionTier = 0 | 1 | 2;

export type KeyWrappingMethod = 'ecdh' | 'master_key';

export interface EncryptedFieldValue {
  iv: string;  // base64, 12 bytes
  ct: string;  // base64, ciphertext
  tag: string; // base64, 16-byte auth tag
}

export interface EncryptedPayload {
  v: number;   // encryption format version
  kv: number;  // account key version
  fields: Record<string, EncryptedFieldValue>;
}

export interface UserEncryptionProfile {
  id: string;
  userId: string;
  pbkdf2Salt: string;
  publicKeyX25519: string;
  publicKeyEd25519: string;
  wrappedPrivateKeyX25519: string;
  wrappedPrivateKeyEd25519: string;
  recoveryKeyHash?: string;
  wrappedMasterKeyByRecovery?: string;
  keyVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountEncryptionKey {
  id: string;
  accountId: string;
  userId: string;
  wrappedAccountKey: string;
  wrappedBy: string;
  wrappingMethod: KeyWrappingMethod;
  keyVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PendingKeyGrant {
  userId: string;
  userName: string;
  publicKeyX25519: string;
}

// Report & Export types

export type ReportFormat = 'csv' | 'pdf' | 'excel';

export type ReportStatus = 'pending' | 'generating' | 'completed' | 'failed';

export type DigestFrequency = 'weekly' | 'monthly';

export interface ReportFilters {
  startDate: string;
  endDate: string;
  categoryIds?: string[];
  tagIds?: string[];
  projectIds?: string[];
  currencyCode?: string;
  includeIncomes: boolean;
  includeExpenses: boolean;
}

export interface GeneratedReport {
  id: string;
  accountId: string;
  userId: string;
  format: ReportFormat;
  status: ReportStatus;
  fileName: string;
  fileSize?: number;
  filters: ReportFilters;
  expiresAt: Date;
  createdAt: Date;
  completedAt?: Date;
}

export interface MonthlyDigest {
  id: string;
  accountId: string;
  periodStart: string;
  periodEnd: string;
  totalIncome: number;
  totalExpenses: number;
  savingsRate: number;
  topCategories: Array<{ name: string; amount: number; percentage: number }>;
  vsLastMonth: { incomeChange: number; expenseChange: number };
  generatedAt: string;
}

export interface BackupMetadata {
  id: string;
  userId: string;
  accountId: string;
  version: number;
  entityCounts: Record<string, number>;
  encrypted: boolean;
  encryptionKeyVersion?: number;
  createdAt: Date;
  fileSize: number;
}

export interface ReportPreferences {
  weeklyEmailEnabled: boolean;
  weeklyEmailDay: number;
  monthlyDigestEnabled: boolean;
}

// Debt/Loan types

export interface DebtSummary {
  id: string;
  type: 'lent' | 'borrowed';
  contactName: string;
  originalAmount: number;
  currencyCode: Currency;
  totalRepaid: number;
  remainingAmount: number;
  status: DebtStatus;
  dueDate?: Date;
  date: Date;
  description?: string;
  repayments: Array<{ id: string; amount: number; date: Date; description?: string }>;
}

// App version (Google Play / App Store update tracking)
export type AppPlatform = 'ios' | 'android';

export interface AppVersion {
  id: string;
  platform: AppPlatform;
  latestVersion: string;
  minSupportedVersion: string;
  releaseNotes: Record<string, string> | null;
  storeUrl: string;
  publishedAt: string;
  updatedAt: string;
}
