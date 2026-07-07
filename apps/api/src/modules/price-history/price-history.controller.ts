import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { SubscriptionTierGuard } from '../subscriptions/guards/subscription-tier.guard';
import { RequireTier } from '../subscriptions/decorators/require-tier.decorator';
import { AuthenticatedRequest } from '../../common/types';
import { PriceHistoryService } from './price-history.service';
import { UpsertAliasDto, MergeProductsDto, BasketCompareRequestDto } from './dto';

@Controller('price-history')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class PriceHistoryController {
  constructor(private readonly priceHistoryService: PriceHistoryService) {}

  // Route order: static paths BEFORE dynamic :param paths
  // GET /price-history
  @Get()
  getPriceHistory(
    @Req() req: AuthenticatedRequest,
    @Query('period') period: '3m' | '6m' | '12m' | 'all' = '6m',
  ) {
    const p: '3m' | '6m' | '12m' | 'all' = ['3m', '6m', '12m', 'all'].includes(period) ? period : '6m';
    return this.priceHistoryService.getPriceHistory(req.accountId, p);
  }

  // GET /price-history/products
  @Get('products')
  listProducts(@Req() req: AuthenticatedRequest) {
    return this.priceHistoryService.listProducts(req.accountId);
  }

  // PATCH /price-history/products/alias — declared BEFORE DELETE /products/alias/:rawName
  @Patch('products/alias')
  @UseGuards(new ViewerBlockGuard())
  upsertAlias(@Req() req: AuthenticatedRequest, @Body() dto: UpsertAliasDto) {
    return this.priceHistoryService.upsertAlias(req.accountId, dto.rawName, dto.canonicalName);
  }

  // DELETE /price-history/products/alias/:rawName
  @Delete('products/alias/:rawName')
  @UseGuards(new ViewerBlockGuard())
  deleteAlias(@Req() req: AuthenticatedRequest, @Param('rawName') rawName: string) {
    return this.priceHistoryService.deleteAlias(req.accountId, rawName);
  }

  // POST /price-history/products/ignore/:rawName
  @Post('products/ignore/:rawName')
  @UseGuards(new ViewerBlockGuard())
  ignoreProduct(@Req() req: AuthenticatedRequest, @Param('rawName') rawName: string) {
    return this.priceHistoryService.ignoreProduct(req.accountId, rawName);
  }

  // POST /price-history/products/merge
  @Post('products/merge')
  @UseGuards(new ViewerBlockGuard())
  mergeProducts(@Req() req: AuthenticatedRequest, @Body() dto: MergeProductsDto) {
    return this.priceHistoryService.mergeProducts(req.accountId, dto.rawNames, dto.canonicalName);
  }

  // DELETE /price-history/price-points/:itemId — exclude a single price record from tracking
  @Delete('price-points/:itemId')
  @UseGuards(new ViewerBlockGuard())
  deletePricePoint(@Req() req: AuthenticatedRequest, @Param('itemId') itemId: string) {
    return this.priceHistoryService.deletePricePoint(req.accountId, itemId);
  }

  // POST /price-history/products/backfill-ai
  // Re-generates canonical names for single-word / missing entries using GPT-4o-mini.
  // Editors and owners only (viewers can't mutate).
  @Post('products/backfill-ai')
  @UseGuards(new ViewerBlockGuard())
  backfillWithAi(@Req() req: AuthenticatedRequest) {
    return this.priceHistoryService.backfillWithAi(req.accountId);
  }

  // POST /price-history/basket — Pro-gated basket price comparison
  @Post('basket')
  @UseGuards(SubscriptionTierGuard)
  @RequireTier('pro')
  compareBasket(@Req() req: AuthenticatedRequest, @Body() dto: BasketCompareRequestDto) {
    return this.priceHistoryService.getBasketComparison(req.accountId, dto.items);
  }
}
