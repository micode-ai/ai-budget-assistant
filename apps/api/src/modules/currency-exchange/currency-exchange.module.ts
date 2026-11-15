import { Module } from '@nestjs/common';
import { CurrencyExchangeController } from './currency-exchange.controller';
import { CurrencyExchangeService } from './currency-exchange.service';
import { ExchangeRateService } from './exchange-rate.service';
import { HistoricalRateService } from './historical-rate.service';

@Module({
  controllers: [CurrencyExchangeController],
  providers: [CurrencyExchangeService, ExchangeRateService, HistoricalRateService],
  exports: [CurrencyExchangeService, ExchangeRateService, HistoricalRateService],
})
export class CurrencyExchangeModule {}
