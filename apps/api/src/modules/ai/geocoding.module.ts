import { Module } from '@nestjs/common';
import { GeocodingService } from './services/geocoding.service';

// Standalone leaf module for GeocodingService — no imports of its own
// (PrismaService + CacheService are both @Global()). Extracted out of
// AiModule so that AiModule and CommunityPriceModule can share exactly ONE
// DI-managed instance instead of each providing their own.
//
// This matters because GeocodingService enforces the Nominatim usage-policy
// rate limit (max 1 req/s) via INSTANCE-level state (`lastRequestAt`,
// serialized in `throttled()`). Two separate instances throttle themselves
// independently, so a burst hitting both at once can send request pairs
// under the 1.1s gap from the same server IP — risking a Nominatim ban that
// would break geocoding for every user, not just the second consumer.
//
// Being a leaf module (no imports), GeocodingModule can be safely imported by
// BOTH AiModule and CommunityPriceModule without recreating the
// AiModule -> ExpensesModule -> CommunityPriceModule -> AiModule cycle that
// previously justified giving CommunityPriceModule its own instance.
@Module({
  providers: [GeocodingService],
  exports: [GeocodingService],
})
export class GeocodingModule {}
