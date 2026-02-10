import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { SubscriptionTierGuard } from '../subscriptions/guards/subscription-tier.guard';
import { RequireTier } from '../subscriptions/decorators/require-tier.decorator';
import { AuthenticatedRequest } from '../../common/types';

@Controller('insights')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get()
  @UseGuards(SubscriptionTierGuard)
  @RequireTier('pro')
  async getInsights(@Req() req: AuthenticatedRequest) {
    return this.insightsService.getInsights(req.accountId);
  }
}
