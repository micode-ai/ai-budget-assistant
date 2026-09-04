import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { TelemetryService } from './telemetry.service';

/**
 * A second controller rather than another route on the ingest one: the ingest
 * route is reachable by every signed-in user and this one must never be, so the
 * two guard sets are kept physically apart (the restore-credentials precedent).
 */
@Controller('admin/telemetry')
@UseGuards(JwtAuthGuard, AdminGuard)
export class TelemetryAdminController {
  constructor(private readonly service: TelemetryService) {}

  @Get('funnel')
  async funnel(@Query('days') days?: string) {
    return this.service.getFunnel(Number(days));
  }
}
