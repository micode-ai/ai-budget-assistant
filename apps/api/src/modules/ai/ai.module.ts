import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { WhisperService } from './services/whisper.service';
import { ChatService } from './services/chat.service';
import { CategorizationService } from './services/categorization.service';
import { OcrService } from './services/ocr.service';
import { ReceiptFinalizerService } from './services/receipt-finalizer.service';
import { ReceiptPdfService } from './services/receipt-pdf.service';
import { GeocodingModule } from './geocoding.module';
import { TagSuggestionService } from './services/tag-suggestion.service';
import { ProjectSuggestionService } from './services/project-suggestion.service';
import { ReceiptCategorySplitService } from './services/receipt-category-split.service';
import { CategorizeSuggestionsService } from './services/categorize-suggestions.service';
import { CategorizeBotService } from './services/categorize-bot.service';
import { GoalPlannerService } from './services/goal-planner.service';
import { UserContextBuilder } from './services/user-context-builder.service';
import { ChatConversationService } from './services/chat-conversation.service';
import { ChatActionLifecycleService } from './services/chat-action-lifecycle.service';
import { AiToolsService } from './services/ai-tools.service';
import { AiExpenseToolsService } from './services/ai-expense-tools.service';
import { AiBudgetToolsService } from './services/ai-budget-tools.service';
import { AiDebtGoalToolsService } from './services/ai-debt-goal-tools.service';
import { AiShoppingToolsService } from './services/ai-shopping-tools.service';
import { AiUndoToolsService } from './services/ai-undo-tools.service';
import { PromptBuilder } from './services/prompt-builder.service';
import { EmbeddingModule } from './embedding.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { IncomesModule } from '../incomes/incomes.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { CategoriesModule } from '../categories/categories.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { DebtsModule } from '../debts/debts.module';
import { AccountsModule } from '../accounts/accounts.module';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { InsightsModule } from '../insights/insights.module';
import { ShoppingListModule } from '../shopping-list/shopping-list.module';
import { PriceHistoryModule } from '../price-history/price-history.module';
import { MerchantRulesModule } from '../merchant-rules/merchant-rules.module';

@Module({
  imports: [EmbeddingModule, SubscriptionsModule, ExpensesModule, IncomesModule, BudgetsModule, CategoriesModule, AnalyticsModule, DebtsModule, AccountsModule, CurrencyExchangeModule, InsightsModule, ShoppingListModule, PriceHistoryModule, MerchantRulesModule, GeocodingModule],
  controllers: [AiController],
  providers: [
    WhisperService,
    ChatService,
    CategorizationService,
    OcrService,
    ReceiptFinalizerService,
    ReceiptPdfService,
    TagSuggestionService,
    ProjectSuggestionService,
    ReceiptCategorySplitService,
    CategorizeSuggestionsService,
    CategorizeBotService,
    GoalPlannerService,
    UserContextBuilder,
    ChatConversationService,
    ChatActionLifecycleService,
    AiToolsService,
    AiExpenseToolsService,
    AiBudgetToolsService,
    AiDebtGoalToolsService,
    AiShoppingToolsService,
    AiUndoToolsService,
    PromptBuilder,
  ],
  exports: [
    WhisperService,
    ChatService,
    CategorizationService,
    OcrService,
    TagSuggestionService,
    ProjectSuggestionService,
    ReceiptCategorySplitService,
    GoalPlannerService,
    CategorizeBotService,
  ],
})
export class AiModule {}
