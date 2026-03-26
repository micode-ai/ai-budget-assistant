import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { InvestmentsService } from './investments.service';
import { InvestmentInsightsService } from './investment-insights.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { SubscriptionTierGuard } from '../subscriptions/guards/subscription-tier.guard';
import { RequireTier } from '../subscriptions/decorators/require-tier.decorator';
import { AiUsageGuard } from '../subscriptions/guards/ai-usage.guard';
import { TrackAiUsage } from '../subscriptions/decorators/track-ai-usage.decorator';
import { AuthenticatedRequest } from '../../common/types';
import {
  CreatePortfolioHoldingDto,
  CreateInvestmentTransactionDto,
  UpdateInvestmentTransactionDto,
  PortfolioAnalyticsRequestDto,
} from './dto';

@Controller('investments')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class InvestmentsController {
  constructor(
    private readonly investmentsService: InvestmentsService,
    private readonly investmentInsightsService: InvestmentInsightsService,
  ) {}

  // ---- Asset Search ----

  @Get('assets/search')
  async searchAssets(@Query('q') query: string) {
    return this.investmentsService.searchAssets(query || '');
  }

  // ---- Holdings ----

  @Get('holdings')
  async getHoldings(@Req() req: AuthenticatedRequest) {
    return this.investmentsService.getHoldings(req.accountId);
  }

  @Post('holdings')
  async createHolding(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePortfolioHoldingDto,
  ) {
    return this.investmentsService.createHolding(req.accountId, req.user.id, dto);
  }

  @Delete('holdings/:id')
  async removeHolding(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.investmentsService.removeHolding(req.accountId, id);
  }

  // ---- Transactions ----

  @Get('transactions')
  async getTransactions(
    @Req() req: AuthenticatedRequest,
    @Query('holdingId') holdingId?: string,
  ) {
    return this.investmentsService.getTransactions(req.accountId, holdingId);
  }

  @Post('transactions')
  async createTransaction(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateInvestmentTransactionDto,
  ) {
    return this.investmentsService.createTransaction(req.accountId, req.user.id, dto);
  }

  @Patch('transactions/:id')
  async updateTransaction(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateInvestmentTransactionDto,
  ) {
    return this.investmentsService.updateTransaction(req.accountId, id, dto);
  }

  @Delete('transactions/:id')
  async removeTransaction(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.investmentsService.removeTransaction(req.accountId, id);
  }

  // ---- Portfolio Summary & Analytics ----

  @Get('summary')
  async getPortfolioSummary(@Req() req: AuthenticatedRequest) {
    return this.investmentsService.getPortfolioSummary(req.accountId);
  }

  @Post('analytics')
  async getPortfolioAnalytics(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PortfolioAnalyticsRequestDto,
  ) {
    return this.investmentsService.getPortfolioAnalytics(req.accountId, dto);
  }

  @Get('holdings/:id/price-history')
  async getAssetPriceHistory(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('days') days?: string,
  ) {
    return this.investmentsService.getAssetPriceHistory(
      req.accountId,
      id,
      days ? parseInt(days) : 30,
    );
  }

  @Post('refresh-prices')
  async refreshPrices(@Req() req: AuthenticatedRequest) {
    return this.investmentsService.refreshPrices(req.accountId);
  }

  // ---- AI Insights ----

  @Get('insights')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('investment_insights', 2.5)
  async getInvestmentInsights(
    @Req() req: AuthenticatedRequest,
    @Query('language') language?: string,
  ) {
    return this.investmentInsightsService.getInvestmentInsights(
      req.accountId,
      language,
    );
  }
}
