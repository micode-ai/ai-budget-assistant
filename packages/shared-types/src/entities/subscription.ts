import type { SubscriptionTier, SubscriptionStatus } from './primitives';

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
