import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { SubscriptionsService } from '../subscriptions.service';

const ACCOUNT_LIMITS: Record<string, number> = {
  free: 3,
  pro: 5,
  business: Infinity,
};

@Injectable()
export class AccountLimitGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) throw new UnauthorizedException();

    const subscription =
      await this.subscriptionsService.getOrCreateSubscription(userId);

    const accountCount = await this.prisma.account.count({
      where: { ownerId: userId, isActive: true },
    });

    const limit = ACCOUNT_LIMITS[subscription.tier] ?? 1;

    if (accountCount >= limit) {
      throw new ForbiddenException(
        `Account limit reached (${limit}). Upgrade your subscription to create more accounts.`,
      );
    }

    return true;
  }
}
