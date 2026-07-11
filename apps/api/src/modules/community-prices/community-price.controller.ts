import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CommunityPriceService } from './community-price.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { SubscriptionTierGuard } from '../subscriptions/guards/subscription-tier.guard';
import { RequireTier } from '../subscriptions/decorators/require-tier.decorator';
import type { CommunityPricePeriod } from '@budget/shared-types';

/**
 * Read side of the Community Price Map (ABA-335 M2). Pro-gated — this is the
 * cross-account "where's cheapest" surface. Every result is k-anonymity-gated in
 * the service; the controller never returns anything the K-gate hasn't cleared,
 * and never exposes a contributorKey.
 */
@Controller('price-history/community')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class CommunityPriceController {
  constructor(private readonly service: CommunityPriceService) {}

  @Get()
  @UseGuards(SubscriptionTierGuard)
  @RequireTier('pro')
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
  @UseGuards(SubscriptionTierGuard)
  @RequireTier('pro')
  async search(@Query('q') q?: string) {
    return this.service.searchProducts((q ?? '').toString());
  }
}
