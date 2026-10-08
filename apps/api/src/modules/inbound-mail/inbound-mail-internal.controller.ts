import { BadRequestException, Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { InternalSecretGuard } from './guards/internal-secret.guard';
import { InboundMailAddressService } from './inbound-mail-address.service';
import { InboundReceiptService } from './inbound-receipt.service';
import { RcptRequestSchema } from './dto';
import type { InboundRcptResult } from '@budget/shared-types';

/**
 * Routes for the SMTP container only. No JwtAuthGuard on purpose: the caller is
 * a service, authenticated by INBOUND_MAIL_SHARED_SECRET. nginx answers 404 for
 * /api/v1/internal/ on the public vhost; the guard also refuses proxied requests.
 */
@Controller('internal/inbound-mail')
@UseGuards(InternalSecretGuard)
export class InboundMailInternalController {
  constructor(
    private readonly addresses: InboundMailAddressService,
    private readonly receipts: InboundReceiptService,
  ) {}

  @Post('rcpt')
  @HttpCode(200)
  async rcpt(@Body() body: unknown): Promise<{ result: InboundRcptResult }> {
    const parsed = RcptRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid request');
    return { result: await this.addresses.checkRcpt(parsed.data.token.toLowerCase(), parsed.data.remoteIp) };
  }

  @Post('messages')
  @HttpCode(202)
  messages(@Body() body: unknown): Promise<{ id: string }> {
    return this.receipts.ingest(body);
  }
}
