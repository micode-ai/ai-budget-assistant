import type { SubscriptionTier, SubscriptionStatus } from '../entities';

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
