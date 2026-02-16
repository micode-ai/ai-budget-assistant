import { Controller, Get, Post, Patch, Param, Query, Body, Req, Res, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { DigestService } from './digest.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { SubscriptionTierGuard } from '../subscriptions/guards/subscription-tier.guard';
import { RequireTier } from '../subscriptions/decorators/require-tier.decorator';
import { AuthenticatedRequest } from '../../common/types';
import { GenerateReportDto, UpdateReportPreferencesDto } from './dto';
import type { Response } from 'express';

@Controller('reports')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly digestService: DigestService,
  ) {}

  @Post('generate')
  async generateReport(
    @Req() req: AuthenticatedRequest,
    @Body() dto: GenerateReportDto,
  ) {
    return this.reportsService.generateReport(req.accountId, req.user.id, dto);
  }

  @Get()
  async listReports(@Req() req: AuthenticatedRequest) {
    return this.reportsService.listReports(req.accountId, req.user.id);
  }

  @Get('preferences')
  async getPreferences(@Req() req: AuthenticatedRequest) {
    return this.reportsService.getPreferences(req.user.id);
  }

  @Patch('preferences')
  async updatePreferences(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateReportPreferencesDto,
  ) {
    return this.reportsService.updatePreferences(req.user.id, dto);
  }

  @Get('monthly-digest')
  @UseGuards(SubscriptionTierGuard)
  @RequireTier('pro')
  async getMonthlyDigest(
    @Req() req: AuthenticatedRequest,
    @Query('month') month: string,
  ) {
    return this.digestService.getDigest(req.accountId, month);
  }

  @Get(':id/download')
  async downloadReport(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    return this.reportsService.downloadReport(req.accountId, req.user.id, id, res);
  }
}
