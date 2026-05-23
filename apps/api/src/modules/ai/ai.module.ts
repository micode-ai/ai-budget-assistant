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
import { UserContextBuilder } from './services/user-context-builder.service';
import { AiToolsService } from './services/ai-tools.service';
import { PromptBuilder } from './services/prompt-builder.service';
import { EmbeddingModule } from './embedding.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { IncomesModule } from '../incomes/incomes.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { CategoriesModule } from '../categories/categories.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { DebtsModule } from '../debts/debts.module';

@Module({
  imports: [EmbeddingModule, SubscriptionsModule, ExpensesModule, IncomesModule, BudgetsModule, CategoriesModule, AnalyticsModule, DebtsModule],
  controllers: [AiController],
  providers: [
    WhisperService,
    ChatService,
    CategorizationService,
    OcrService,
    TagSuggestionService,
    ProjectSuggestionService,
    SplitSuggestionService,
    GoalPlannerService,
    UserContextBuilder,
    AiToolsService,
    PromptBuilder,
  ],
  exports: [
    WhisperService,
    ChatService,
    CategorizationService,
    OcrService,
    TagSuggestionService,
    ProjectSuggestionService,
    SplitSuggestionService,
    GoalPlannerService,
  ],
})
export class AiModule {}
