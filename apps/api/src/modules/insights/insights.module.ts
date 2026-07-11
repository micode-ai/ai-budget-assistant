import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { AiInsightsService } from './ai-insights.service';
import { StoryService } from './story.service';
import { FatFinderService } from './fat-finder.service';
import { SafeToSpendService } from './safe-to-spend.service';
import { WrappedService } from './wrapped.service';
import { BudgetsModule } from '../budgets/budgets.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { WalletModule } from '../wallet/wallet.module';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { PriceHistoryModule } from '../price-history/price-history.module';
import { GamificationModule } from '../gamification/gamification.module';

@Module({
  imports: [
    BudgetsModule,
    SubscriptionsModule,
    ConfigModule,
    WalletModule,
    CurrencyExchangeModule,
    PriceHistoryModule,
    GamificationModule,
  ],
  controllers: [InsightsController],
  providers: [InsightsService, AiInsightsService, StoryService, FatFinderService, SafeToSpendService, WrappedService],
  exports: [InsightsService, AiInsightsService, StoryService, FatFinderService, SafeToSpendService, WrappedService],
})
export class InsightsModule {}
