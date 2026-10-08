import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CommunityPriceService } from './community-price.service';
import { CommunityPriceThrottlerGuard } from './community-price-throttler.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import type { CommunityPricePeriod } from '@budget/shared-types';

/**
 * Read side of the Community Price Map (ABA-335 M2). FREE on every tier since
 * ABA-642 (no SubscriptionTierGuard / @RequireTier) — gated instead by the
 * COMMUNITY_PRICE_READ_ENABLED kill switch in the service, and rate-limited to
 * 60 requests/min per user because the corpus is the moat and reads are free.
 * (No APP_GUARD exists in this app, so @Throttle only takes effect with the
 * guard attached on the route.) Every result is gated in the service; the
 * controller never returns anything the gates have not cleared, and never
 * exposes a contributorKey. Read-only routes: no ViewerBlockGuard.
 */
@Controller('price-history/community')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class CommunityPriceController {
  constructor(private readonly service: CommunityPriceService) {}

  @Get()
  @UseGuards(CommunityPriceThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async getPrices(
    @Query('product') product?: string,
    @Query('region') region?: string,
    @Query('period') period?: string,
  ) {
    const p: CommunityPricePeriod = period === '4w' ? '4w' : '1w';
    return this.service.getCommunityPrices(
      (product ?? '').toString(),
      region ? region.toString() : null,
      p,
    );
  }

  @Get('products')
  @UseGuards(CommunityPriceThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async search(@Query('q') q?: string) {
    return this.service.searchProducts((q ?? '').toString());
  }

  @Get('map')
  @UseGuards(CommunityPriceThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async map(
    @Query('product') product?: string,
    @Query('region') region?: string,
    @Query('period') period?: string,
  ) {
    const p: CommunityPricePeriod = period === '4w' ? '4w' : '1w';
    return this.service.getCommunityMap(
      (product ?? '').toString(),
      region ? region.toString() : null,
      p,
    );
  }
}
