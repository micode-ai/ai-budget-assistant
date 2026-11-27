import { Module, forwardRef } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { SupportController } from './support.controller';
import { SupportAdminController } from './support-admin.controller';
import { SupportAdminService } from './support-admin.service';
import { AdminGuard } from '../admin/admin.guard';
import { SupportService } from './support.service';
import { SupportTranslationService } from './support-translation.service';
import { SupportTelegramService } from './support-telegram.service';
import { SupportTelegramController } from './support-telegram.controller';
import { SUPPORT_FORWARDER } from './support-forwarder';

@Module({
  imports: [forwardRef(() => AdminModule), SubscriptionsModule],
  controllers: [SupportController, SupportAdminController, SupportTelegramController],
  providers: [SupportService, SupportAdminService, SupportTranslationService,
    AdminGuard,
    SupportTelegramService,
    { provide: SUPPORT_FORWARDER, useExisting: SupportTelegramService },
  ],
  exports: [SupportService, SupportAdminService, SupportTranslationService],
})
export class SupportModule {}
