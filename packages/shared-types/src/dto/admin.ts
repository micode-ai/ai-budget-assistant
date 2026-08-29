import type { SubscriptionTier } from '../entities';

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

export interface AdminAcquisitionBreakdownRow {
  value: string;
  count: number;
}

export interface AdminAcquisitionBreakdownResponse {
  windowDays: number;
  totalUsers: number;
  windowSignups: number;
  attributedWindowSignups: number;
  bySource: AdminAcquisitionBreakdownRow[];
  byLocation: AdminAcquisitionBreakdownRow[];
  byLanguage: AdminAcquisitionBreakdownRow[];
  byPlan: AdminAcquisitionBreakdownRow[];
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
