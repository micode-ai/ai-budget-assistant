import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';

@Module({
  imports: [CurrencyExchangeModule],
  controllers: [VehiclesController],
  providers: [VehiclesService],
})
export class VehiclesModule {}
