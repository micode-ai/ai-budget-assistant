import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { WhisperService } from './services/whisper.service';
import { ChatService } from './services/chat.service';
import { CategorizationService } from './services/categorization.service';
import { OcrService } from './services/ocr.service';
import { TagSuggestionService } from './services/tag-suggestion.service';
import { ProjectSuggestionService } from './services/project-suggestion.service';
import { SplitSuggestionService } from './services/split-suggestion.service';
import { GoalPlannerService } from './services/goal-planner.service';
import { EmbeddingService } from './services/embedding.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { IncomesModule } from '../incomes/incomes.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { CategoriesModule } from '../categories/categories.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [SubscriptionsModule, ExpensesModule, IncomesModule, BudgetsModule, CategoriesModule, AnalyticsModule],
  controllers: [AiController],
  providers: [WhisperService, ChatService, CategorizationService, OcrService, TagSuggestionService, ProjectSuggestionService, SplitSuggestionService, GoalPlannerService, EmbeddingService],
  exports: [WhisperService, ChatService, CategorizationService, OcrService, TagSuggestionService, ProjectSuggestionService, SplitSuggestionService, GoalPlannerService, EmbeddingService],
})
export class AiModule {}
