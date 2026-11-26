import { Module } from '@nestjs/common';
import { UtilitiesController } from './utilities.controller';
import { UtilitiesService } from './utilities.service';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';

@Module({
  imports: [CurrencyExchangeModule],
  controllers: [UtilitiesController],
  providers: [UtilitiesService],
})
export class UtilitiesModule {}
