import { Module } from '@nestjs/common';
import { CommunityPriceService } from './community-price.service';
import { CommunityPriceController } from './community-price.controller';
import { CommunityReceiptSeenPruneCron } from './community-receipt-seen-prune.cron';
import { GeocodingModule } from '../ai/geocoding.module';

// PrismaService, ConfigService and CacheService are all @Global() — no explicit
// module import needed. SubscriptionsModule is no longer imported (ABA-642): the
// read routes are free on every tier, so nothing here uses a tier guard.
//
// GeocodingService comes from the standalone GeocodingModule, NOT from
// importing AiModule directly — AiModule already imports ExpensesModule, and
// ExpensesModule needs this module for the community-price write hook, so
// AiModule -> ExpensesModule -> CommunityPriceModule -> AiModule would be
// circular. GeocodingModule has no imports of its own (a leaf module), so
// importing it here is cycle-free AND gives this module the SAME
// GeocodingService singleton AiModule uses — required because the Nominatim
// rate-limit throttle is instance-level state; two separate instances would
// each independently pace their own ≥1.1s gap and could together exceed
// Nominatim's 1 req/s usage-policy limit from this server's single IP.
@Module({
  imports: [GeocodingModule],
  controllers: [CommunityPriceController],
  providers: [CommunityPriceService, CommunityReceiptSeenPruneCron],
  exports: [CommunityPriceService],
})
export class CommunityPriceModule {}
