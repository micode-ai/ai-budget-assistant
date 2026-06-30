import { Module } from '@nestjs/common';
import { PurchaseRequestsController } from './purchase-requests.controller';
import { PurchaseRequestsService } from './purchase-requests.service';
import { FamilyFeedModule } from '../family-feed/family-feed.module';

// NotificationsModule and DatabaseModule are @Global() — no explicit import needed.
@Module({
  imports: [FamilyFeedModule],
  controllers: [PurchaseRequestsController],
  providers: [PurchaseRequestsService],
  exports: [PurchaseRequestsService],
})
export class PurchaseRequestsModule {}
