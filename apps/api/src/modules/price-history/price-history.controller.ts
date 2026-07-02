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
import { AuthenticatedRequest } from '../../common/types';
import { PriceHistoryService } from './price-history.service';
import { UpsertAliasDto, MergeProductsDto } from './dto';

@Controller('price-history')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class PriceHistoryController {
  constructor(private readonly priceHistoryService: PriceHistoryService) {}

  // Route order: static paths BEFORE dynamic :param paths
  // GET /price-history
  @Get()
  getPriceHistory(
    @Req() req: AuthenticatedRequest,
    @Query('period') period: '3m' | '6m' | '12m' = '6m',
  ) {
    const p: '3m' | '6m' | '12m' = ['3m', '6m', '12m'].includes(period) ? period : '6m';
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

  // POST /price-history/products/merge
  @Post('products/merge')
  @UseGuards(new ViewerBlockGuard())
  mergeProducts(@Req() req: AuthenticatedRequest, @Body() dto: MergeProductsDto) {
    return this.priceHistoryService.mergeProducts(req.accountId, dto.rawNames, dto.canonicalName);
  }
}
