import { SetMetadata } from '@nestjs/common';
import type { SubscriptionTier } from '@prisma/client';

export const REQUIRED_TIER_KEY = 'requiredSubscriptionTier';
export const RequireTier = (tier: SubscriptionTier) =>
  SetMetadata(REQUIRED_TIER_KEY, tier);
