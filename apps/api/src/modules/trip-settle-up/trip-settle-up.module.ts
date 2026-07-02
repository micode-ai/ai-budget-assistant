import { Module } from '@nestjs/common';
import { TripSettleUpController } from './trip-settle-up.controller';
import { TripSettleUpService } from './trip-settle-up.service';
import { TripSettleUpReminderCron } from './trip-settle-up-reminder.cron';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';

// PrismaService and NotificationsModule are @Global() — no explicit import needed.
@Module({
  imports: [CurrencyExchangeModule],
  controllers: [TripSettleUpController],
  providers: [TripSettleUpService, TripSettleUpReminderCron],
  exports: [TripSettleUpService],
})
export class TripSettleUpModule {}
