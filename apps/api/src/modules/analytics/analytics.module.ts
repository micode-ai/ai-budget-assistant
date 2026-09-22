import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { CacheModule } from '../../common/cache/cache.module';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';

@Module({
  imports: [CacheModule, CurrencyExchangeModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
