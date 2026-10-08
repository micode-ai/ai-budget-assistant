import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AiUsageGuard } from '../subscriptions/guards/ai-usage.guard';
import { TrackAiUsage } from '../subscriptions/decorators/track-ai-usage.decorator';
import { AuthenticatedRequest } from '../../common/types';
import { InboundMailEnabledGuard } from './guards/inbound-mail-enabled.guard';
import { InboundMailAddressService } from './inbound-mail-address.service';
import { InboundReceiptService } from './inbound-receipt.service';
import { ConfirmBodySchema, ListQuerySchema, PatchAddressBodySchema } from './dto';
import type {
  InboundMailAddressResponse,
  InboundReceiptCountResponse,
  InboundReceiptDetail,
  InboundReceiptListItem,
} from '@budget/shared-types';

/**
 * User-facing e-mail receipts API (ABA-644). Every route 404s while
 * INBOUND_MAIL_ENABLED is off. The address belongs to the USER, so address
 * routes are keyed on `req.user.id`; receipts are keyed on user AND account.
 */
@Controller()
@UseGuards(InboundMailEnabledGuard, JwtAuthGuard, AccountContextGuard)
export class InboundMailController {
  constructor(
    private readonly addresses: InboundMailAddressService,
    private readonly receipts: InboundReceiptService,
  ) {}

  @Get('inbound-mail/address')
  getAddress(@Req() req: AuthenticatedRequest): Promise<InboundMailAddressResponse | null> {
    return this.addresses.get(req.user.id);
  }

  @Post('inbound-mail/address')
  @UseGuards(new ViewerBlockGuard())
  createAddress(@Req() req: AuthenticatedRequest): Promise<InboundMailAddressResponse> {
    return this.addresses.create(req.accountId, req.user.id);
  }

  @Patch('inbound-mail/address')
  @UseGuards(new ViewerBlockGuard())
  setTarget(@Req() req: AuthenticatedRequest, @Body() body: unknown): Promise<InboundMailAddressResponse> {
    const parsed = PatchAddressBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('targetAccountId is required');
    return this.addresses.setTarget(req.user.id, parsed.data.targetAccountId);
  }

  @Post('inbound-mail/address/rotate')
  @UseGuards(new ViewerBlockGuard())
  rotate(@Req() req: AuthenticatedRequest): Promise<InboundMailAddressResponse> {
    return this.addresses.rotate(req.user.id);
  }

  @Delete('inbound-mail/address')
  @HttpCode(204)
  @UseGuards(new ViewerBlockGuard())
  async disable(@Req() req: AuthenticatedRequest): Promise<void> {
    await this.addresses.disable(req.user.id);
  }

  @Get('inbound-receipts')
  list(@Req() req: AuthenticatedRequest, @Query() query: unknown): Promise<InboundReceiptListItem[]> {
    const parsed = ListQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('status must be pending or handled');
    return this.receipts.list(req.accountId, req.user.id, parsed.data.status);
  }

  // Declared before `:id` so `count` is never captured as an id.
  @Get('inbound-receipts/count')
  count(@Req() req: AuthenticatedRequest): Promise<InboundReceiptCountResponse> {
    return this.receipts.countPending(req.accountId, req.user.id);
  }

  @Get('inbound-receipts/:id')
  detail(@Req() req: AuthenticatedRequest, @Param('id') id: string): Promise<InboundReceiptDetail> {
    return this.receipts.detail(req.accountId, req.user.id, id);
  }

  @Get('inbound-receipts/:id/document')
  async document(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Res() res: Response): Promise<void> {
    const doc = await this.receipts.document(req.accountId, req.user.id, id);
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(doc.body);
  }

  @Post('inbound-receipts/:id/confirm')
  @HttpCode(204)
  @UseGuards(new ViewerBlockGuard())
  async confirm(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown): Promise<void> {
    const parsed = ConfirmBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('expenseId is required');
    await this.receipts.confirm(req.accountId, req.user.id, id, parsed.data.expenseId);
  }

  @Post('inbound-receipts/:id/dismiss')
  @HttpCode(204)
  @UseGuards(new ViewerBlockGuard())
  async dismiss(@Req() req: AuthenticatedRequest, @Param('id') id: string): Promise<void> {
    await this.receipts.dismiss(req.accountId, req.user.id, id);
  }

  @Post('inbound-receipts/:id/retry')
  @HttpCode(200)
  @UseGuards(new ViewerBlockGuard(), AiUsageGuard)
  @TrackAiUsage('ocr', 2.0)
  retry(@Req() req: AuthenticatedRequest, @Param('id') id: string): Promise<InboundReceiptDetail> {
    return this.receipts.retry(req.accountId, req.user.id, id);
  }
}
