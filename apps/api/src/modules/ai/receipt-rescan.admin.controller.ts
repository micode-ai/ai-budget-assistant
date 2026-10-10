import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { ReceiptRescanService } from './services/receipt-rescan.service';

/**
 * Admin-only community-price backfill: re-read recent stored receipts of consenting
 * users with the server's OCR so they contribute (see ReceiptRescanService).
 */
@Controller('admin/community-prices/rescan')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ReceiptRescanAdminController {
  constructor(private readonly rescan: ReceiptRescanService) {}

  @Post()
  start(@Body() body: { emails?: unknown; dryRun?: unknown }) {
    const emails = Array.isArray(body?.emails)
      ? body.emails.filter((e): e is string => typeof e === 'string').slice(0, 50)
      : undefined;
    return this.rescan.start({ emails, dryRun: body?.dryRun === true });
  }

  @Get()
  last() {
    return this.rescan.lastReport();
  }
}
