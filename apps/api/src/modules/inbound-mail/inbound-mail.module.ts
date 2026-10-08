import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { InboundMailController } from './inbound-mail.controller';
import { InboundMailInternalController } from './inbound-mail-internal.controller';
import { InboundMailAddressService } from './inbound-mail-address.service';
import { InboundReceiptService } from './inbound-receipt.service';
import { InboundReceiptProcessorService } from './inbound-receipt-processor.service';
import { InboundMailCron } from './inbound-mail.cron';
import { InboundMailEnabledGuard } from './guards/inbound-mail-enabled.guard';
import { InternalSecretGuard } from './guards/internal-secret.guard';

// PrismaService, CacheService, ConfigService and NotificationsModule are global.
// OcrService comes from AiModule and ReceiptDuplicateService from ExpensesModule:
// reuse the singletons, never provide a second instance.
@Module({
  imports: [AiModule, ExpensesModule, SubscriptionsModule],
  controllers: [InboundMailController, InboundMailInternalController],
  providers: [
    InboundMailAddressService,
    InboundReceiptService,
    InboundReceiptProcessorService,
    InboundMailCron,
    InboundMailEnabledGuard,
    InternalSecretGuard,
  ],
})
export class InboundMailModule {}
