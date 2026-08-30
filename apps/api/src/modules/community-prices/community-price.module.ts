import { Module } from '@nestjs/common';
import { CommunityPriceService } from './community-price.service';
import { CommunityPriceController } from './community-price.controller';
import { GeocodingModule } from '../ai/geocoding.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

// PrismaService + ConfigService are both @Global() — no explicit module import
// needed for either.
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
  imports: [SubscriptionsModule, GeocodingModule],
  controllers: [CommunityPriceController],
  providers: [CommunityPriceService],
  exports: [CommunityPriceService],
})
export class CommunityPriceModule {}
