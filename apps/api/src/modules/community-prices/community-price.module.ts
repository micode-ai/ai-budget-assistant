import { Module } from '@nestjs/common';
import { CommunityPriceService } from './community-price.service';
import { GeocodingService } from '../ai/services/geocoding.service';

// PrismaService + ConfigService are both @Global() — no explicit module import
// needed for either.
//
// GeocodingService is provided directly here (not via importing AiModule) to
// avoid a module cycle: AiModule already imports ExpensesModule, and
// ExpensesModule needs this module for the community-price write hook —
// AiModule -> ExpensesModule -> CommunityPriceModule -> AiModule would be
// circular. GeocodingService's own dependencies (PrismaService, optional
// CacheService) are global, so a second DI instance here is inert — it shares
// the same `geocode_cache` table, just not the in-process Nominatim throttle
// with AiModule's instance (acceptable: reverse-geocode calls are rare and
// cached per-coordinate across ALL accounts).
@Module({
  providers: [CommunityPriceService, GeocodingService],
  exports: [CommunityPriceService],
})
export class CommunityPriceModule {}
