import { Controller, Post, Get, Patch, Delete, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { ReceiptSplitService } from './receipt-split.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { TripArchivedGuard } from '../accounts/guards/trip-archived.guard';
import { CreateSplitDto } from './dto';
import { AuthenticatedRequest } from '../../common/types';

/**
 * Owns the payer-facing `/expenses/:id/receipt-split*` routes. A separate
 * controller, not folded into ExpensesController — its own guard header and
 * route surface are easier to reason about standalone. (ExpensesModule DOES
 * now import ReceiptSplitModule anyway, for DI into ExpensesService.remove —
 * see expenses.module.ts and expenses.service.ts's expireForExpense call
 * site.)
 *
 * Named `receipt-split`, NOT `split` — `expenses.controller.ts` already serves
 * `POST/DELETE /expenses/:id/splits` for the unrelated **category splits**
 * feature (allocating one expense across multiple budget categories). `split`
 * vs `splits` is a one-character difference between two features where one
 * clears a category allocation and the other cancels a receipt split and
 * soft-deletes debt rows — a human hazard worth a distinct route segment even
 * though Express's literal-segment matching means there is no actual routing
 * collision.
 *
 * Every path here has a static segment after `:id` (`/receipt-split`,
 * `/receipt-split/:participantId/confirm`), which ExpensesController's own
 * `:id` routes cannot match (they expect exactly one segment after
 * `/expenses/`), so there is no route-shadowing risk regardless of module load
 * order. Declared here after ExpensesModule's own `bulk`/`merge` routes in
 * app.module.ts anyway, to keep the ABA-166 declaration-order discipline this
 * codebase has been bitten by twice.
 *
 * All four routes carry the same guard set as expenses.controller.ts's other write
 * routes (JwtAuthGuard + AccountContextGuard at the class level, ViewerBlockGuard +
 * TripArchivedGuard per route) — including the GET, per the feature's design: a
 * viewer cannot see the split view any more than they can create one.
 */
@Controller('expenses')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class ReceiptSplitController {
  constructor(private readonly receiptSplitService: ReceiptSplitService) {}

  /**
   * Distinct participant names this account has split with before, most
   * recent first (the "people you've split with" suggestion chips on the
   * mobile assignment screen). NOT itself an `:id/receipt-split` route — no
   * specific expense is involved, this is an account-wide read.
   *
   * Safe from the ABA-166 route-shadowing class of bug regardless of
   * declaration order: Express only matches a route when EVERY path segment
   * agrees, and this route's second segment ("recent-participants") can
   * never equal the literal "receipt-split" the `:id/receipt-split` GET
   * below requires there.
   */
  @Get('receipt-split/recent-participants')
  @UseGuards(new ViewerBlockGuard(), TripArchivedGuard)
  async recentParticipants(@Req() req: AuthenticatedRequest, @Query('limit') limit?: string) {
    return this.receiptSplitService.getRecentParticipantNames(req.accountId, limit);
  }

  @Post(':id/receipt-split')
  @UseGuards(new ViewerBlockGuard(), TripArchivedGuard)
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateSplitDto,
  ) {
    return this.receiptSplitService.createSplit(req.accountId, req.user.id, id, dto);
  }

  @Get(':id/receipt-split')
  @UseGuards(new ViewerBlockGuard(), TripArchivedGuard)
  async get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.receiptSplitService.getSplit(req.accountId, id);
  }

  @Patch(':id/receipt-split/:participantId/confirm')
  @UseGuards(new ViewerBlockGuard(), TripArchivedGuard)
  async confirm(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
  ) {
    return this.receiptSplitService.confirmParticipant(req.accountId, req.user.id, id, participantId);
  }

  @Delete(':id/receipt-split')
  @UseGuards(new ViewerBlockGuard(), TripArchivedGuard)
  async cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.receiptSplitService.cancelSplit(req.accountId, id);
  }
}
