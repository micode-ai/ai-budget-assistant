import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { AiInsightsService } from './ai-insights.service';
import { StoryService } from './story.service';
import { FatFinderService } from './fat-finder.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { SubscriptionTierGuard } from '../subscriptions/guards/subscription-tier.guard';
import { RequireTier } from '../subscriptions/decorators/require-tier.decorator';
import { AiUsageGuard } from '../subscriptions/guards/ai-usage.guard';
import { TrackAiUsage } from '../subscriptions/decorators/track-ai-usage.decorator';
import { AuthenticatedRequest } from '../../common/types';

@Controller('insights')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class InsightsController {
  constructor(
    private readonly insightsService: InsightsService,
    private readonly aiInsightsService: AiInsightsService,
    private readonly storyService: StoryService,
    private readonly fatFinderService: FatFinderService,
  ) {}

  @Get()
  async getInsights(@Req() req: AuthenticatedRequest) {
    return this.insightsService.getInsights(req.accountId);
  }

  @Get('ai-charts')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('insights', 2.0)
  async getAICharts(
    @Req() req: AuthenticatedRequest,
    @Query('language') language?: string,
  ) {
    return this.aiInsightsService.getAIInsights(req.accountId, language, req.user.id);
  }

  @Post('story')
  async getSpendingStory(
    @Req() req: AuthenticatedRequest,
    @Body() body: { period: 'week' | 'month'; forceRegenerate?: boolean; language?: string; month?: number; year?: number },
  ) {
    return this.storyService.getSpendingStory(
      req.accountId,
      body.period || 'month',
      body.forceRegenerate,
      body.language,
      req.user.id,
      body.month,
      body.year,
    );
  }

  @Post('fat-finder')
  async getFatFinderReport(
    @Req() req: AuthenticatedRequest,
    @Body() body: { forceRegenerate?: boolean; language?: string; month?: number; year?: number },
  ) {
    return this.fatFinderService.generateReport(
      req.accountId,
      body.language,
      body.forceRegenerate,
      req.user.id,
      body.month,
      body.year,
    );
  }
}
