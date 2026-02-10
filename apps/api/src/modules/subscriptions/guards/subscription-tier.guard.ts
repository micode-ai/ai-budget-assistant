import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SubscriptionTier } from '@prisma/client';
import { SubscriptionsService } from '../subscriptions.service';
import { REQUIRED_TIER_KEY } from '../decorators/require-tier.decorator';

const TIER_HIERARCHY: Record<SubscriptionTier, number> = {
  free: 0,
  pro: 1,
  business: 2,
};

@Injectable()
export class SubscriptionTierGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredTier = this.reflector.get<SubscriptionTier>(
      REQUIRED_TIER_KEY,
      context.getHandler(),
    );

    if (!requiredTier) return true;

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) throw new UnauthorizedException();

    const subscription = await this.subscriptionsService.getOrCreateSubscription(userId);
    const userTierLevel = TIER_HIERARCHY[subscription.tier];
    const requiredTierLevel = TIER_HIERARCHY[requiredTier];

    if (userTierLevel < requiredTierLevel) {
      throw new ForbiddenException(
        `This feature requires a ${requiredTier} subscription or higher`,
      );
    }

    return true;
  }
}
