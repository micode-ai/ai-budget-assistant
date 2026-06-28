import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { AiInsightsService } from './ai-insights.service';
import { StoryService } from './story.service';
import { FatFinderService } from './fat-finder.service';
import { SafeToSpendService } from './safe-to-spend.service';
import { BudgetsModule } from '../budgets/budgets.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { WalletModule } from '../wallet/wallet.module';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';

@Module({
  imports: [BudgetsModule, SubscriptionsModule, ConfigModule, WalletModule, CurrencyExchangeModule],
  controllers: [InsightsController],
  providers: [InsightsService, AiInsightsService, StoryService, FatFinderService, SafeToSpendService],
  exports: [InsightsService, AiInsightsService, StoryService, FatFinderService, SafeToSpendService],
})
export class InsightsModule {}
