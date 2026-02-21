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
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [SubscriptionsModule],
  controllers: [AiController],
  providers: [WhisperService, ChatService, CategorizationService, OcrService, TagSuggestionService, ProjectSuggestionService, SplitSuggestionService, GoalPlannerService],
  exports: [WhisperService, ChatService, CategorizationService, OcrService, TagSuggestionService, ProjectSuggestionService, SplitSuggestionService, GoalPlannerService],
})
export class AiModule {}
