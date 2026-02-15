import { SetMetadata } from '@nestjs/common';

type SubscriptionTier = 'free' | 'pro' | 'business';

export const REQUIRED_TIER_KEY = 'requiredSubscriptionTier';
export const RequireTier = (tier: SubscriptionTier) =>
  SetMetadata(REQUIRED_TIER_KEY, tier);
