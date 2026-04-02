import { Module, forwardRef } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { SubscriptionsService } from './subscriptions.service';
import { TrialReminderCron } from './trial-reminder.cron';
import { SubscriptionTierGuard } from './guards/subscription-tier.guard';
import { AiUsageGuard } from './guards/ai-usage.guard';
import { AccountLimitGuard } from './guards/account-limit.guard';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [forwardRef(() => AdminModule)],
  controllers: [SubscriptionsController, StripeWebhookController],
  providers: [
    SubscriptionsService,
    TrialReminderCron,
    SubscriptionTierGuard,
    AiUsageGuard,
    AccountLimitGuard,
  ],
  exports: [
    SubscriptionsService,
    SubscriptionTierGuard,
    AiUsageGuard,
    AccountLimitGuard,
  ],
})
export class SubscriptionsModule {}
