import { Module } from '@nestjs/common';
import { InflationShieldTrackingService } from './inflation-shield-tracking.service';

// Deliberately a Prisma-only leaf (no heavy imports) so BOTH InsightsModule and
// ExpensesModule can import it without forming a module cycle. PrismaService is
// provided by the @Global() database module, so no import is needed here.
@Module({
  providers: [InflationShieldTrackingService],
  exports: [InflationShieldTrackingService],
})
export class InflationShieldTrackingModule {}
