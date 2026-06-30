// Admin-specific types

export type SubscriptionTier = 'free' | 'pro' | 'business';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing' | 'paused';

// Dashboard
export interface DashboardStats {
  totalUsers: number;
  activeToday: number;
  totalExpenses: number;
  totalIncome: number;
  mrr: number;
  mrrChange: number;
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

// Users
export interface AdminUserListItem {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  currencyCode: string;
  language: string;
  createdAt: string;
  lastSyncAt: string | null;
  subscription: {
    tier: SubscriptionTier;
    status: SubscriptionStatus;
    aiRequestsUsed: number;
  } | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminUserDetail {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  currencyCode: string;
  timezone: string;
  language: string;
  createdAt: string;
  lastSyncAt: string | null;
  pushToken: string | null;
  weeklyEmailEnabled: boolean;
  monthlyDigestEnabled: boolean;
  aiResponseMode: string | null;
  aiModel: string | null;
  subscription: {
    id: string;
    tier: SubscriptionTier;
    status: SubscriptionStatus;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    trialStart: string | null;
    trialEnd: string | null;
    aiRequestsUsed: number;
    aiRequestsResetAt: string | null;
    cancelAtPeriodEnd: boolean;
    customAiLimit: number | null;
  } | null;
  accounts: Array<{
    id: string;
    name: string;
    type: string;
    role: string;
    currencyCode: string;
  }>;
  aiUsage: AdminUserUsageItem;
  recentExpenses: Array<{
    id: string;
    amount: number;
    currencyCode: string;
    description: string | null;
    categoryName: string | null;
    date: string;
    source: string;
  }>;
  recentIncomes: Array<{
    id: string;
    amount: number;
    currencyCode: string;
    description: string | null;
    date: string;
  }>;
}

// Analytics
export interface AnalyticsOverview {
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  activeUsersToday: number;
  activeUsersThisWeek: number;
  mrr: number;
  mrrChange: number;
  totalRevenue: number;
  dailyRegistrations: Array<{ date: string; count: number }>;
}

export interface AiUsageTrend {
  date: string;
  totalCost: number;
  totalRequests: number;
  byFeature: Record<string, { cost: number; count: number }>;
}

export interface SubscriptionStats {
  distribution: {
    free: number;
    pro: number;
    business: number;
    trialing: number;
  };
  mrr: number;
  churnRate: number;
  conversionRate: number;
  recentChanges: Array<{
    id: string;
    adminName: string;
    action: string;
    targetId: string | null;
    details: Record<string, unknown> | null;
    createdAt: string;
  }>;
}

// Communications
export interface NotificationRecipient {
  id: string;
  name: string;
  email: string;
}

export interface NotificationLogItem {
  id: string;
  adminId: string;
  adminName?: string;
  type: 'push' | 'email' | 'broadcast';
  recipientCount: number;
  successCount: number;
  failCount: number;
  subject: string | null;
  body: string | null;
  filters: Record<string, unknown> | null;
  recipients: NotificationRecipient[];
  createdAt: string;
}

export interface ScheduledNotificationItem {
  id: string;
  adminId: string;
  adminName?: string;
  type: 'push' | 'email';
  title: string | null;
  subject: string | null;
  body: string;
  filters: Record<string, unknown> | null;
  userIds: string[] | null;
  scheduledAt: string;
  executedAt: string | null;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  createdAt: string;
}

// Audit Log
export interface AuditLogItem {
  id: string;
  adminId: string;
  adminName?: string;
  adminEmail?: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

// System Health
export interface SystemHealth {
  api: 'ok' | 'error';
  database: 'ok' | 'error';
  redis: 'ok' | 'error';
  uptime: number;
  memoryUsage: number;
}

// Real-time events
export interface RealtimeEvent {
  type: 'new_user' | 'ai_request' | 'error' | 'subscription_change';
  data: Record<string, unknown>;
  timestamp: string;
}
