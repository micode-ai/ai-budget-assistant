import { Module } from '@nestjs/common';
import { TelemetryController } from './telemetry.controller';
import { TelemetryAdminController } from './telemetry-admin.controller';
import { TelemetryService } from './telemetry.service';
import { TelemetryCleanupCron } from './telemetry-cleanup.cron';
import { ClientErrorsService } from './client-errors.service';

@Module({
  controllers: [TelemetryController, TelemetryAdminController],
  providers: [TelemetryService, TelemetryCleanupCron, ClientErrorsService],
})
export class TelemetryModule {}
