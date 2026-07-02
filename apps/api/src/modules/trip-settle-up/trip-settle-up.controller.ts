import { Controller, Get, Post, Patch, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { TripArchivedGuard } from '../accounts/guards/trip-archived.guard';
import { TripSettleUpService } from './trip-settle-up.service';
import type { AuthenticatedRequest } from '../../common/types';
import { SettleUpPayDto } from './dto';

// Route is declared under /accounts/:id/settle-up for REST readability, but the
// actual scoped accountId always comes from req.accountId (set by AccountContextGuard
// from the X-Account-Id header + verified membership) — never from the untrusted :id
// URL param, matching the account-scoping convention used by every other guarded
// module in this codebase (see family-feed.controller.ts / purchase-requests.controller.ts).
@Controller('accounts/:id/settle-up')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class TripSettleUpController {
  constructor(private readonly tripSettleUpService: TripSettleUpService) {}

  @Get()
  async getBalances(@Req() req: AuthenticatedRequest) {
    return this.tripSettleUpService.getBalances(req.accountId);
  }

  // Same convention as getBalances above: accountId always comes from
  // req.accountId (guard-validated), never from the untrusted :id URL param —
  // see Task 10's IDOR fix note at the top of this file.
  // TripArchivedGuard blocks creating new settle-up payments once a trip is archived
  // (a closed, read-only trip) — but paying is still allowed while the trip is
  // merely `settling`, which is exactly when members are expected to pay up.
  @Post('pay')
  @UseGuards(TripArchivedGuard)
  async createPayment(@Req() req: AuthenticatedRequest, @Body() dto: SettleUpPayDto) {
    return this.tripSettleUpService.createPayment(req.accountId, dto, req.user.id);
  }

  // Same convention as getBalances/createPayment above: accountId always comes from
  // req.accountId (guard-validated), never from the untrusted :id URL param. :txnId is
  // safe to take from the URL param as-is because the service scopes its lookup by
  // (id, accountId) together — a foreign txnId simply resolves to a 404, and the receiver
  // check further ensures only the actual toUserId can confirm it.
  // Intentionally NOT TripArchivedGuard-ed: a trip can be force-archived by the owner
  // while a payment is still pending confirmation, and blocking confirm here would
  // strand that legitimate in-flight confirmation with no way to resolve it. Only
  // creating a brand-new payment (above) is blocked once archived.
  @Patch(':txnId/confirm')
  async confirmPayment(@Req() req: AuthenticatedRequest, @Param('txnId') txnId: string) {
    return this.tripSettleUpService.confirmPayment(req.accountId, txnId, req.user.id);
  }
}
