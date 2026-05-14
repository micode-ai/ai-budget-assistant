import { Controller, Get, Post, Patch, Delete, Param, Query, Body, Req, Res, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { DigestService } from './digest.service';
import { ReportSchedulerService } from './report-scheduler.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';
import { GenerateReportDto, UpdateReportPreferencesDto } from './dto';
import type { Response } from 'express';

@Controller('reports')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly digestService: DigestService,
    private readonly schedulerService: ReportSchedulerService,
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
  async getMonthlyDigest(
    @Req() req: AuthenticatedRequest,
    @Query('month') month: string,
  ) {
    return this.digestService.getDigest(req.accountId, month);
  }

  @Post('trigger-weekly')
  async triggerWeeklyEmail(@Req() req: AuthenticatedRequest) {
    await this.schedulerService.processWeeklyEmailsForUser(req.user.id);
    return { success: true };
  }

  @Delete(':id')
  async deleteReport(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.reportsService.deleteReport(req.accountId, req.user.id, id);
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
