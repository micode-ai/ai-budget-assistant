import { BadRequestException, Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';
import type { DrillDownLevel, SavingsKind } from '@budget/shared-types';

// Same "no period ⇒ whole history" convention `AiToolsService`'s
// `get_deposit_total`/`get_discount_total` use — a narrow default window is
// the known first cause of "found nothing" on a stat a user taps into with no
// period picker of its own on this specific drill-down.
const ALL_TIME_START = '2000-01-01';

@Controller('analytics')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  async getSummary(
    @Req() req: AuthenticatedRequest,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.analyticsService.getSummary(
      req.accountId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('items')
  async getItemBreakdown(
    @Req() req: AuthenticatedRequest,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.analyticsService.getItemBreakdown(
      req.accountId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('trends')
  async getTrends(
    @Req() req: AuthenticatedRequest,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.analyticsService.getTrends(
      req.accountId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('aggregated')
  async getAggregatedSummary(
    @Req() req: AuthenticatedRequest,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.analyticsService.getAggregatedSummary(
      req.user.id,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Post('drill-down')
  async getDrillDown(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      level: DrillDownLevel;
      parentId?: string;
      startDate: string;
      endDate: string;
      currencyCode?: string;
      locale?: string;
    },
  ) {
    return this.analyticsService.getDrillDown(
      req.accountId,
      body.level,
      new Date(body.startDate),
      new Date(body.endDate),
      body.parentId,
      body.currencyCode,
      body.locale,
      req.user.timezone,
    );
  }

  @Get('by-tag')
  async getByTag(
    @Req() req: AuthenticatedRequest,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.analyticsService.getTagBreakdown(
      req.accountId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('by-project')
  async getByProject(@Req() req: AuthenticatedRequest) {
    return this.analyticsService.getProjectBreakdown(req.accountId);
  }

  /**
   * The tappable "Discount savings"/"Deposits paid" rows on the Analytics
   * tab's Quick Insights section drill into this — the same underlying
   * columns and pure arithmetic the AI chat's `get_discount_total`/
   * `get_deposit_total` tools already read (`docs/contracts/
   * quick-insights-savings-drilldown.md`), exposed as a plain REST read
   * instead of requiring a chat round-trip.
   */
  @Get('savings-detail')
  async getSavingsDetail(
    @Req() req: AuthenticatedRequest,
    @Query('kind') kind: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (kind !== 'discount' && kind !== 'deposit') {
      throw new BadRequestException('kind must be "discount" or "deposit"');
    }
    const savingsKind: SavingsKind = kind;
    const start = new Date(startDate || ALL_TIME_START);
    const end = new Date(endDate || new Date().toISOString().slice(0, 10));
    const baseCurrency = req.user.currencyCode || 'USD';

    return savingsKind === 'deposit'
      ? this.analyticsService.getDepositSummary(req.accountId, baseCurrency, start, end)
      : this.analyticsService.getDiscountSummary(req.accountId, baseCurrency, start, end);
  }
}
