import { Module } from '@nestjs/common';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { ExchangeRateAlertsController } from './exchange-rate-alerts.controller';
import { ExchangeRateAlertsService } from './exchange-rate-alerts.service';
import { ExchangeRateAlertCron } from './exchange-rate-alert.cron';

// PrismaService and NotificationsModule are @Global() — no explicit import needed.
@Module({
  // Reuses the existing singleton ExchangeRateService — do not provide a second
  // instance (see the GeocodingService duplicate-instance lesson in CLAUDE.md).
  imports: [CurrencyExchangeModule],
  controllers: [ExchangeRateAlertsController],
  providers: [ExchangeRateAlertsService, ExchangeRateAlertCron],
})
export class ExchangeRateAlertsModule {}
