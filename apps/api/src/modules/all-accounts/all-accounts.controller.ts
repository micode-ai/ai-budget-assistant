import { BadRequestException, Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../common/types';
import { AllAccountsService } from './all-accounts.service';
import { ConsolidatedReportService } from './consolidated-report.service';
import { ConsolidatedReportBody } from './dto/consolidated-report.dto';

const MAX_DAYS = 1096;
const DAY_MS = 86400000;

function parseDay(s: string | undefined): number {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new BadRequestException('Dates must be YYYY-MM-DD');
  const ms = Date.parse(`${s}T00:00:00.000Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== s) throw new BadRequestException('Invalid date');
  return ms;
}

export function parsePeriod(start?: string, end?: string): { start: string; end: string } {
  const s = parseDay(start);
  const e = parseDay(end);
  if (e < s) throw new BadRequestException('end must not be before start');
  if ((e - s) / DAY_MS > MAX_DAYS) throw new BadRequestException(`Period must not exceed ${MAX_DAYS} days`);
  return { start: start as string, end: end as string };
}

export function parseIdList(v?: string): string[] {
  return (v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 100);
}

/**
 * `GET /all-accounts/analytics`. User-scoped on purpose: sums every account the
 * caller is a member of, so no `AccountContextGuard` and no `req.accountId`.
 */
@Controller('all-accounts')
@UseGuards(JwtAuthGuard)
export class AllAccountsController {
  constructor(
    private readonly service: AllAccountsService,
    private readonly reportService: ConsolidatedReportService,
  ) {}

  /** One report across all (or a group's) accounts; stored as a user-scoped GeneratedReport. */
  @Post('reports')
  report(@Req() req: AuthenticatedRequest, @Body() body: ConsolidatedReportBody) {
    parsePeriod(body.startDate, body.endDate);
    return this.reportService.generate({ id: req.user.id, currencyCode: req.user.currencyCode || 'USD' }, body);
  }

  @Get('analytics')
  analytics(
    @Req() req: AuthenticatedRequest,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('exclude') exclude?: string,
  ) {
    const period = parsePeriod(start, end);
    return this.service.getAnalytics(
      { id: req.user.id, currencyCode: req.user.currencyCode || 'USD' },
      { ...period, exclude: parseIdList(exclude), onlyAccountIds: null, groupId: null },
    );
  }
}
