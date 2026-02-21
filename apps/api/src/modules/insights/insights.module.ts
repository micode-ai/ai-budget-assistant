import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { AiInsightsService } from './ai-insights.service';
import { StoryService } from './story.service';
import { FatFinderService } from './fat-finder.service';
import { BudgetsModule } from '../budgets/budgets.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [BudgetsModule, SubscriptionsModule, ConfigModule],
  controllers: [InsightsController],
  providers: [InsightsService, AiInsightsService, StoryService, FatFinderService],
  exports: [InsightsService, AiInsightsService, StoryService, FatFinderService],
})
export class InsightsModule {}
