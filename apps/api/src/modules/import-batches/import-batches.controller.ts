import { Controller, Get, Delete, Param, UseGuards, Req, HttpCode } from '@nestjs/common';
import { ImportBatchesService } from './import-batches.service';
import { ImportReportService } from './import-report.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import type { AuthenticatedRequest } from '../../common/types';

@Controller('import/batches')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class ImportBatchesController {
  constructor(
    private readonly service: ImportBatchesService,
    private readonly reportService: ImportReportService,
  ) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.service.list(req.accountId);
  }

  /** The instant report for a just-committed import (ABA-643), in the caller's display currency. */
  @Get(':id/report')
  report(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.reportService.getReport(req.accountId, req.user.currencyCode || 'USD', id);
  }

  @Delete(':id')
  @HttpCode(200)
  rollback(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.rollback(req.accountId, id);
  }
}
