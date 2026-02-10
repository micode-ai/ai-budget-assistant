import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { SubscriptionsService } from '../subscriptions.service';
import { AI_FEATURE_TYPE_KEY, AI_COST_UNITS_KEY } from '../decorators/track-ai-usage.decorator';

@Injectable()
export class AiUsageGuard implements CanActivate {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) throw new UnauthorizedException();

    const handler = context.getHandler();
    const featureType =
      Reflect.getMetadata(AI_FEATURE_TYPE_KEY, handler) || 'unknown';
    const costUnits =
      Reflect.getMetadata(AI_COST_UNITS_KEY, handler) || 1.0;

    const accountId = request.accountId as string | undefined;
    await this.subscriptionsService.trackAiUsage(userId, featureType, costUnits, accountId);

    return true;
  }
}
