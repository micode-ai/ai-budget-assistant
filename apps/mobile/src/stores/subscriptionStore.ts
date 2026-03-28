import { create } from 'zustand';
import { api } from '../services/api';
import type { SubscriptionTier, SubscriptionStatus, PlanDto } from '@budget/shared-types';

interface SubscriptionState {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  trialEnd?: string;

  // Usage
  aiRequestsUsed: number;
  aiRequestsLimit: number;
  usageResetAt?: string;
  percentUsed: number;
  bonusAiRequests: number;
  isTrialing: boolean;

  // Plans (localized pricing)
  plans: PlanDto[];
  currencySymbol: string;

  isLoading: boolean;
  error: string | null;

  // Actions
  loadSubscription: () => Promise<void>;
  loadUsage: () => Promise<void>;
  loadPlans: () => Promise<void>;
  createCheckout: (priceEnvKey: string) => Promise<string>;
  openPortal: () => Promise<string>;

  // Selectors
  canUseAi: () => boolean;
  canCreateAccount: (currentCount: number) => boolean;
  canAddMember: (currentCount: number) => boolean;
  isPro: () => boolean;
  isBusiness: () => boolean;
  isPaid: () => boolean;

  clearError: () => void;
  reset: () => void;
}

const ACCOUNT_LIMITS: Record<SubscriptionTier, number> = {
  free: 3,
  pro: 5,
  business: Infinity,
};

const MEMBER_LIMITS: Record<SubscriptionTier, number> = {
  free: 1,
  pro: 5,
  business: Infinity,
};

export const useSubscriptionStore = create<SubscriptionState>()((set, get) => ({
  tier: 'free',
  status: 'active',
  currentPeriodEnd: undefined,
  cancelAtPeriodEnd: false,
  trialEnd: undefined,

  aiRequestsUsed: 0,
  aiRequestsLimit: 50,
  usageResetAt: undefined,
  percentUsed: 0,
  bonusAiRequests: 0,
  isTrialing: false,

  plans: [],
  currencySymbol: '$',

  isLoading: false,
  error: null,

  loadSubscription: async () => {
    set({ isLoading: true, error: null });
    try {
      const sub = await api.getCurrentSubscription();
      set({
        tier: sub.tier,
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        trialEnd: sub.trialEnd,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load subscription',
        isLoading: false,
      });
    }
  },

  loadUsage: async () => {
    try {
      const usage = await api.getUsageStats();
      set({
        aiRequestsUsed: usage.aiRequestsUsed,
        aiRequestsLimit: usage.aiRequestsLimit === -1 ? Infinity : usage.aiRequestsLimit,
        usageResetAt: usage.resetAt,
        percentUsed: usage.percentUsed,
        bonusAiRequests: usage.bonusAiRequests ?? 0,
        isTrialing: usage.isTrialing ?? false,
      });
    } catch (error) {
      console.error('Failed to load usage stats:', error);
    }
  },

  loadPlans: async () => {
    try {
      const data = await api.getPlans();
      set({
        plans: data.plans,
        currencySymbol: data.symbol,
      });
    } catch (error) {
      console.error('Failed to load plans:', error);
    }
  },

  createCheckout: async (priceEnvKey: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.createCheckoutSession(
        priceEnvKey,
        'aibudget://subscription/success',
        'aibudget://subscription/cancel',
      );
      set({ isLoading: false });
      return result.url;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create checkout',
        isLoading: false,
      });
      throw error;
    }
  },

  openPortal: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.createPortalSession('aibudget://subscription');
      set({ isLoading: false });
      return result.url;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to open portal',
        isLoading: false,
      });
      throw error;
    }
  },

  canUseAi: () => {
    const { tier, aiRequestsUsed, aiRequestsLimit } = get();
    if (tier === 'business') return true;
    return aiRequestsUsed < aiRequestsLimit;
  },

  canCreateAccount: (currentCount: number) => {
    const { tier } = get();
    return currentCount < ACCOUNT_LIMITS[tier];
  },

  canAddMember: (currentCount: number) => {
    const { tier } = get();
    return currentCount < MEMBER_LIMITS[tier];
  },

  isPro: () => {
    const { tier } = get();
    return tier === 'pro' || tier === 'business';
  },

  isBusiness: () => get().tier === 'business',

  isPaid: () => get().tier !== 'free',

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      tier: 'free',
      status: 'active',
      currentPeriodEnd: undefined,
      cancelAtPeriodEnd: false,
      trialEnd: undefined,
      aiRequestsUsed: 0,
      aiRequestsLimit: 50,
      usageResetAt: undefined,
      percentUsed: 0,
      isTrialing: false,
      plans: [],
      currencySymbol: '$',
      isLoading: false,
      error: null,
    }),
}));
