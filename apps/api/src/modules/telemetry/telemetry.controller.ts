import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../common/types';
import { TelemetryService } from './telemetry.service';
import { IngestTelemetryDto } from './dto';

/**
 * No AccountContextGuard: telemetry is about the person using the app, not about
 * an account's data, and a screen view has no account. ThrottlerGuard is applied
 * explicitly because this app registers no global one, so `@Throttle` alone
 * would be inert.
 */
@Controller('telemetry')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class TelemetryController {
  constructor(private readonly service: TelemetryService) {}

  @Post('events')
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async ingest(@Req() req: AuthenticatedRequest, @Body() dto: IngestTelemetryDto): Promise<void> {
    // 204 regardless of how many events survived: the client has nothing useful
    // to do with a rejection and must never retry.
    await this.service.ingest(req.user.id, dto);
  }
}
