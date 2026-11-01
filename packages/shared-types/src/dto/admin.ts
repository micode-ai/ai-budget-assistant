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

export interface AdminGroupMetricsDailyPoint {
  date: string;
  groupsCreated: number;
  guestsJoined: number;
  guestsLinked: number;
}

/** GET /admin/groups/metrics — shared expense groups (ABA-640). Aggregates only, no PII. */
export interface AdminGroupMetricsResponse {
  windowDays: number;
  totals: {
    groupsCreated: number;
    /** Non-archived groups with activity (an expense or a settlement) inside the window. */
    activeGroups: number;
    archivedGroups: number;
    membersTotal: number;
    guestMembers: number;
    guestsLinked: number;
    appUsersJoinedViaLink: number;
  };
  daily: AdminGroupMetricsDailyPoint[];
}

export interface AdminOAuthClient {
  id: string;
  name: string;
  homepageUrl: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  createdAt: string;
  activeGrants: number;
  requestsLastMinute: number;
  status: 'active' | 'blocked';
  blockedReason: string | null;
  isVerified: boolean;
  /** null = default limit */
  rateLimitPerGrant: number | null;
  rateLimitPerClient: number | null;
  isDeleted: boolean;
}

export interface UpdateAdminOAuthClientDto {
  status?: 'active' | 'blocked';
  blockedReason?: string;
  isVerified?: boolean;
  rateLimitPerGrant?: number | null;
  rateLimitPerClient?: number | null;
}
