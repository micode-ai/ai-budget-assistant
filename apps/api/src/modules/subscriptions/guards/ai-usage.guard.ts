import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { SubscriptionsService } from '../subscriptions.service';
import { AI_FEATURE_TYPE_KEY, AI_COST_UNITS_KEY } from '../decorators/track-ai-usage.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { getAiCostMultiplier } from '../../ai/services/model-resolver';
import { AdminGateway } from '../../admin/admin.gateway';

@Injectable()
export class AiUsageGuard implements CanActivate {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly prisma: PrismaService,
    @Optional() @Inject(forwardRef(() => AdminGateway))
    private readonly adminGateway: AdminGateway | null,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) throw new UnauthorizedException();

    const handler = context.getHandler();
    const featureType =
      Reflect.getMetadata(AI_FEATURE_TYPE_KEY, handler) || 'unknown';
    const baseCost =
      Reflect.getMetadata(AI_COST_UNITS_KEY, handler) || 1.0;

    // Apply cost multiplier based on user's AI model preference
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { aiModel: true },
    });
    const adjustedCost = baseCost * getAiCostMultiplier(user?.aiModel);

    const accountId = request.accountId as string | undefined;
    await this.subscriptionsService.trackAiUsage(userId, featureType, adjustedCost, accountId);

    // Broadcast AI request to admin dashboard (fire-and-forget)
    this.adminGateway?.emitAiRequest({
      userId,
      featureType,
      costUnits: adjustedCost,
      timestamp: new Date().toISOString(),
    });

    return true;
  }
}
