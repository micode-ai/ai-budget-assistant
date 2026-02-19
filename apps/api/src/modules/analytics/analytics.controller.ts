import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';
import type { DrillDownLevel } from '@budget/shared-types';

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
}
