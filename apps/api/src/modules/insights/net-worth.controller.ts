import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../common/types';
import { NetWorthService } from './net-worth.service';

/**
 * `GET /net-worth` (ABA-799). User-scoped on purpose: it sums every account
 * the caller is a member of, so there is no `AccountContextGuard` and no
 * `req.accountId`. `exclude` is a comma-separated list of account ids the
 * user switched off; ids the caller is not a member of are simply never summed.
 */
@Controller('net-worth')
@UseGuards(JwtAuthGuard)
export class NetWorthController {
  constructor(private readonly netWorth: NetWorthService) {}

  @Get()
  get(@Req() req: AuthenticatedRequest, @Query('exclude') exclude?: string) {
    const excluded = (exclude ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100);
    // Display currency from the user, never from a row (display-currency-conversion).
    return this.netWorth.getNetWorth(req.user.id, req.user.currencyCode || 'USD', excluded);
  }
}
