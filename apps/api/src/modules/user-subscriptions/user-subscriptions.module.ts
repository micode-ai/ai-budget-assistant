import { Module } from '@nestjs/common';
import { UserSubscriptionsController } from './user-subscriptions.controller';
import { UserSubscriptionsService } from './user-subscriptions.service';
import { SubscriptionRenewalCron } from './subscription-renewal.cron';

@Module({
  controllers: [UserSubscriptionsController],
  providers: [UserSubscriptionsService, SubscriptionRenewalCron],
  exports: [UserSubscriptionsService],
})
export class UserSubscriptionsModule {}
