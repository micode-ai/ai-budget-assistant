import { Controller, Get, Post, Put, Body, Query, UseGuards, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { InsightsService } from './insights.service';
import { AiInsightsService } from './ai-insights.service';
import { StoryService } from './story.service';
import { FatFinderService } from './fat-finder.service';
import { SafeToSpendService } from './safe-to-spend.service';
import { WrappedService } from './wrapped.service';
import { InflationShieldService } from './inflation-shield.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { SubscriptionTierGuard } from '../subscriptions/guards/subscription-tier.guard';
import { RequireTier } from '../subscriptions/decorators/require-tier.decorator';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { RealSalaryService } from './real-salary/real-salary.service';
import { RealSalaryBriefPdf } from './real-salary/real-salary-brief.pdf';
import { validateSalaryProfile } from './real-salary/real-salary.validation';
import { AuthenticatedRequest } from '../../common/types';

@Controller('insights')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class InsightsController {
  constructor(
    private readonly insightsService: InsightsService,
    private readonly aiInsightsService: AiInsightsService,
    private readonly storyService: StoryService,
    private readonly fatFinderService: FatFinderService,
    private readonly safeToSpendService: SafeToSpendService,
    private readonly wrappedService: WrappedService,
    private readonly inflationShieldService: InflationShieldService,
    private readonly realSalaryService: RealSalaryService,
    private readonly realSalaryBriefPdf: RealSalaryBriefPdf,
  ) {}

  @Get()
  async getInsights(@Req() req: AuthenticatedRequest) {
    return this.insightsService.getInsights(req.accountId);
  }

  /**
   * GET /insights/safe-to-spend
   * Returns the deterministic safe-to-spend number for today.
   * No role guard — read-only; viewers may access it.
   * No subscription tier guard — this is a FREE feature.
   * baseCurrency resolved from user.currencyCode (same pattern as chat.service.ts).
   */
  @Get('safe-to-spend')
  async getSafeToSpend(@Req() req: AuthenticatedRequest) {
    const baseCurrency = req.user.currencyCode || 'USD';
    return this.safeToSpendService.compute(req.accountId, req.user.id, baseCurrency);
  }

  /**
   * GET /insights/wrapped?year=YYYY[&month=M]
   * Spotify-Wrapped-style year-in-review, assembled from existing data.
   * No tier guard — FREE (a growth/shareability feature), same precedent as safe-to-spend.
   * Defaults to the current year; clamps to a sane range.
   */
  @Get('wrapped')
  async getWrapped(
    @Req() req: AuthenticatedRequest,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const baseCurrency = req.user.currencyCode || 'USD';
    const today = new Date();
    const now = today.getFullYear();
    let target = parseInt(year ?? '', 10);
    if (!Number.isFinite(target) || target < 2000 || target > now) target = now;
    // ?month=1..12 → the monthly deck (ABA-641). A month in the future becomes the current one.
    if (month !== undefined) {
      let m = parseInt(month, 10);
      if (!Number.isFinite(m) || m < 1 || m > 12) m = today.getMonth() + 1;
      if (target === now && m > today.getMonth() + 1) m = today.getMonth() + 1;
      return this.wrappedService.getMonthlyWrapped(req.accountId, req.user.id, baseCurrency, target, m);
    }
    return this.wrappedService.getWrapped(req.accountId, req.user.id, baseCurrency, target);
  }

  /**
   * GET /insights/inflation-shield
   * Forecasts per-product prices and recommends what to stock up on before it
   * rises. No tier guard — FREE (retention/virality), same precedent as safe-to-spend.
   */
  @Get('inflation-shield')
  async getInflationShield(@Req() req: AuthenticatedRequest) {
    const baseCurrency = req.user.currencyCode || 'USD';
    return this.inflationShieldService.getShield(req.accountId, req.user.id, baseCurrency);
  }

  @Get('ai-charts')
  @UseGuards(SubscriptionTierGuard)
  @RequireTier('pro')
  async getAICharts(
    @Req() req: AuthenticatedRequest,
    @Query('language') language?: string,
  ) {
    return this.aiInsightsService.getAIInsights(req.accountId, language, req.user.id);
  }

  @Post('story')
  @UseGuards(SubscriptionTierGuard)
  @RequireTier('pro')
  async getSpendingStory(
    @Req() req: AuthenticatedRequest,
    @Body() body: { period: 'week' | 'month'; forceRegenerate?: boolean; language?: string; month?: number; year?: number },
  ) {
    // baseCurrency from user.currencyCode — the story is narrated in it (ABA-387).
    return this.storyService.getSpendingStory(
      req.accountId,
      body.period || 'month',
      body.forceRegenerate,
      body.language,
      req.user.id,
      body.month,
      body.year,
      req.user.currencyCode || 'USD',
    );
  }

  @Post('fat-finder')
  @UseGuards(SubscriptionTierGuard)
  @RequireTier('pro')
  async getFatFinderReport(
    @Req() req: AuthenticatedRequest,
    @Body() body: { forceRegenerate?: boolean; language?: string; month?: number; year?: number },
  ) {
    // baseCurrency resolved from user.currencyCode — same pattern as safe-to-spend/wrapped.
    // The report is labelled and computed in it; never inferred from an expense row (ABA-386).
    return this.fatFinderService.generateReport(
      req.accountId,
      body.language,
      body.forceRegenerate,
      req.user.id,
      body.month,
      body.year,
      req.user.currencyCode || 'USD',
    );
  }

  /**
   * GET /insights/real-salary
   * Personal inflation vs. pay: is the caller's raise keeping up with what
   * their own money actually buys. No tier guard — free, same precedent as
   * safe-to-spend/wrapped/inflation-shield.
   */
  @Get('real-salary')
  async getRealSalary(@Req() req: AuthenticatedRequest) {
    return this.realSalaryService.compute(req.accountId, req.user.id, req.user.currencyCode || 'USD');
  }

  @Get('real-salary/profile')
  async getRealSalaryProfile(@Req() req: AuthenticatedRequest) {
    return this.realSalaryService.getProfile(req.accountId, req.user.id);
  }

  @Put('real-salary/profile')
  @UseGuards(new ViewerBlockGuard())
  async saveRealSalaryProfile(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.realSalaryService.saveProfile(req.accountId, req.user.id, validateSalaryProfile(body));
  }

  @Get('real-salary/categories')
  async getRealSalaryCategories(@Req() req: AuthenticatedRequest) {
    return this.realSalaryService.listCategories(req.accountId, req.user.currencyCode || 'USD');
  }

  @Post('real-salary/brief')
  @UseGuards(SubscriptionTierGuard)
  @RequireTier('pro')
  async getRealSalaryBrief(
    @Req() req: AuthenticatedRequest,
    @Query('lang') lang: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.realSalaryService.compute(req.accountId, req.user.id, req.user.currencyCode || 'USD');
    if (data.status !== 'ready') {
      res.status(409).json({ message: 'Real salary is not ready', status: data.status });
      return;
    }
    const pdf = await this.realSalaryBriefPdf.render(data, lang || 'en');
    const fileName = `real-salary-${data.computedAt.slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('X-Report-Filename', fileName);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  }
}
