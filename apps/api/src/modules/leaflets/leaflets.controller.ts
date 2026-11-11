import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { LeafletBudget, LeafletPageResult, LeafletResult } from '@budget/shared-types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';
import { parseAdminEmails } from '../admin/admin-emails.util';
import { LeafletsService } from './leaflets.service';
import { LeafletBudgetService } from './leaflet-budget.service';
import {
  CreateLeafletRequestSchema,
  LeafletPageRequestSchema,
  LeafletPdfRequestSchema,
  LeafletPushOpenedSchema,
  parseBody,
} from './dto';

/** R3: an ADMIN_EMAILS user reads leaflets without the page budget; everything else is the same. */
function isAdmin(req: AuthenticatedRequest): boolean {
  const email = req.user?.email?.trim().toLowerCase();
  return !!email && parseAdminEmails().includes(email);
}

// No ViewerBlockGuard: reading a leaflet writes only the reader's own derived facts,
// and viewers may read leaflets (Add to list follows the shopping list's own rules).
@Controller('leaflets')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class LeafletsController {
  constructor(
    private readonly service: LeafletsService,
    private readonly budgetService: LeafletBudgetService,
  ) {}

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() body: unknown): Promise<{ id: string }> {
    return this.service.create(req.accountId, req.user.id, parseBody(CreateLeafletRequestSchema, body));
  }

  // Static segments before ':id'.
  @Get('budget')
  budget(@Req() req: AuthenticatedRequest): Promise<LeafletBudget> {
    return this.budgetService.get(req.user.id);
  }

  /** The community promo push was opened. Scoped to the caller's own push log; 204 either way. */
  @Post('push-opened')
  @HttpCode(204)
  async markPushOpened(@Req() req: AuthenticatedRequest, @Body() body: unknown): Promise<void> {
    const { pushKey } = parseBody(LeafletPushOpenedSchema, body);
    await this.service.markPushOpened(req.user.id, pushKey);
  }

  @Post('items/:itemId/added')
  @HttpCode(204)
  async markAdded(@Req() req: AuthenticatedRequest, @Param('itemId') itemId: string): Promise<void> {
    await this.service.markAdded(req.accountId, itemId);
  }

  @Get()
  findActive(@Req() req: AuthenticatedRequest): Promise<LeafletResult[]> {
    return this.service.findActive(req.accountId);
  }

  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string): Promise<LeafletResult> {
    return this.service.findOne(req.accountId, id);
  }

  @Post(':id/pages')
  @HttpCode(200)
  async readPage(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<LeafletPageResult> {
    const dto = parseBody(LeafletPageRequestSchema, body);
    return this.service.readPage(req.accountId, req.user.id, id, dto, isAdmin(req));
  }

  @Post(':id/pdf')
  @HttpCode(202)
  async uploadPdf(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ id: string }> {
    const dto = parseBody(LeafletPdfRequestSchema, body);
    return this.service.startPdf(req.accountId, req.user.id, id, dto, isAdmin(req));
  }
}
