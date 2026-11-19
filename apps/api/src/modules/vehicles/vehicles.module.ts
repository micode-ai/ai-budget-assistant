import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { VehicleCostRulesCron } from './vehicle-cost-rules.cron';
import { VehicleRenewalCron } from './vehicle-renewal.cron';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';

@Module({
  imports: [CurrencyExchangeModule],
  controllers: [VehiclesController],
  providers: [VehiclesService, VehicleCostRulesCron, VehicleRenewalCron],
  // The bots' "Add to fuel log" button writes through the app's own upsert (ABA-830).
  exports: [VehiclesService],
})
export class VehiclesModule {}
