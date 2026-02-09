import { Module } from '@nestjs/common';
import { CurrencyExchangeController } from './currency-exchange.controller';
import { CurrencyExchangeService } from './currency-exchange.service';
import { ExchangeRateService } from './exchange-rate.service';

@Module({
  controllers: [CurrencyExchangeController],
  providers: [CurrencyExchangeService, ExchangeRateService],
  exports: [CurrencyExchangeService, ExchangeRateService],
})
export class CurrencyExchangeModule {}
