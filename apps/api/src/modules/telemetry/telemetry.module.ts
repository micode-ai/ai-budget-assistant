import { Module } from '@nestjs/common';
import { TelemetryController } from './telemetry.controller';
import { TelemetryAdminController } from './telemetry-admin.controller';
import { TelemetryService } from './telemetry.service';
import { TelemetryCleanupCron } from './telemetry-cleanup.cron';

@Module({
  controllers: [TelemetryController, TelemetryAdminController],
  providers: [TelemetryService, TelemetryCleanupCron],
})
export class TelemetryModule {}
