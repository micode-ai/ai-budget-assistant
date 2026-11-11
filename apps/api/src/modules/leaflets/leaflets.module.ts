import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PriceHistoryModule } from '../price-history/price-history.module';
import { ReceiptPdfService } from '../ai/services/receipt-pdf.service';
import { LeafletsController } from './leaflets.controller';
import { LeafletsService } from './leaflets.service';
import { LeafletReaderService } from './leaflet-reader.service';
import { LeafletBudgetService } from './leaflet-budget.service';
import { LeafletPruneCron } from './leaflet-prune.cron';
import { CommunityPromoService } from './community-promo.service';
import { LeafletPushMatchService } from './leaflet-push-match.service';
import { LeafletNotificationLedger } from './leaflet-notification-ledger.service';
import { LeafletPromoPushCron } from './leaflet-promo-push.cron';
import { LeafletsAdminController } from './leaflets-admin.controller';
import { LeafletsAdminService } from './leaflets-admin.service';

// PrismaService, ConfigService, CacheService and NotificationsService are global. ReceiptPdfService is stateless PDF IO with
// no dependencies, so it is provided here rather than importing the whole AiModule.
@Module({
  imports: [SubscriptionsModule, PriceHistoryModule],
  controllers: [LeafletsController, LeafletsAdminController],
  providers: [
    LeafletsService,
    LeafletReaderService,
    LeafletBudgetService,
    LeafletPruneCron,
    ReceiptPdfService,
    CommunityPromoService,
    LeafletPushMatchService,
    LeafletNotificationLedger,
    LeafletPromoPushCron,
    LeafletsAdminService,
  ],
  exports: [LeafletsService, LeafletReaderService, LeafletBudgetService, CommunityPromoService],
})
export class LeafletsModule {}
