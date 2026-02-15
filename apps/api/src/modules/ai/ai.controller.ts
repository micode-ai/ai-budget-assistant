import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AiUsageGuard } from '../subscriptions/guards/ai-usage.guard';
import { TrackAiUsage } from '../subscriptions/decorators/track-ai-usage.decorator';
import { AuthenticatedRequest } from '../../common/types';
import { WhisperService } from './services/whisper.service';
import { ChatService } from './services/chat.service';
import { CategorizationService } from './services/categorization.service';
import { OcrService } from './services/ocr.service';
import { TagSuggestionService } from './services/tag-suggestion.service';
import { ProjectSuggestionService } from './services/project-suggestion.service';
import { SplitSuggestionService } from './services/split-suggestion.service';

@Controller('ai')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class AiController {
  constructor(
    private readonly whisperService: WhisperService,
    private readonly chatService: ChatService,
    private readonly categorizationService: CategorizationService,
    private readonly ocrService: OcrService,
    private readonly tagSuggestionService: TagSuggestionService,
    private readonly projectSuggestionService: ProjectSuggestionService,
    private readonly splitSuggestionService: SplitSuggestionService,
  ) {}

  @Post('transcribe')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('voice', 1.0)
  async transcribe(
    @Body() body: { audio: string; language?: string },
  ) {
    const buffer = Buffer.from(body.audio, 'base64');
    return this.whisperService.transcribe(buffer, body.language);
  }

  @Post('parse-expense')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('parse', 1.0)
  async parseExpense(
    @Req() req: AuthenticatedRequest,
    @Body() body: { text: string },
  ) {
    return this.categorizationService.parseExpenseFromText(body.text, req.user.id, req.accountId);
  }

  @Post('categorize')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('categorization', 0.5)
  async categorize(
    @Req() req: AuthenticatedRequest,
    @Body() body: { description: string },
  ) {
    return this.categorizationService.categorize(body.description, req.user.id, req.accountId);
  }

  @Post('chat')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('chat', 1.0)
  async chat(
    @Req() req: AuthenticatedRequest,
    @Body() body: { message: string; conversationId?: string },
  ) {
    return this.chatService.chat(req.user.id, body.message, body.conversationId, req.accountId);
  }

  @Post('scan-receipt')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('ocr', 2.0)
  async scanReceipt(
    @Req() req: AuthenticatedRequest,
    @Body() body: { imageBase64: string; userPrompt?: string },
  ) {
    return this.ocrService.parseReceipt(body.imageBase64, req.user.id, req.accountId, body.userPrompt);
  }

  @Post('extract-text')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('ocr', 2.0)
  async extractText(@Body() body: { imageBase64: string }) {
    return { text: await this.ocrService.extractTextFromImage(body.imageBase64) };
  }

  @Get('suggest-category')
  async suggestCategory(
    @Req() req: AuthenticatedRequest,
    @Query('description') description: string,
  ) {
    const historySuggestion = await this.categorizationService.suggestFromHistory(
      req.accountId,
      description,
    );

    if (historySuggestion) {
      return {
        categoryId: historySuggestion.categoryId,
        categoryName: historySuggestion.categoryName,
        confidence: historySuggestion.confidence,
        source: 'history' as const,
      };
    }

    // Fallback to AI
    const aiResult = await this.categorizationService.categorize(
      description,
      req.user.id,
      req.accountId,
    );

    return {
      categoryId: aiResult.categoryId,
      categoryName: aiResult.categoryName,
      confidence: aiResult.confidence,
      source: 'ai' as const,
    };
  }

  @Get('suggest-tags')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('tag_suggestion', 0.5)
  async suggestTags(
    @Req() req: AuthenticatedRequest,
    @Query('description') description: string,
    @Query('merchant') merchant?: string,
  ) {
    return this.tagSuggestionService.suggestTags(
      req.accountId,
      description,
      merchant,
    );
  }

  @Post('suggest-project')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('project_suggestion', 0.5)
  async suggestProject(
    @Req() req: AuthenticatedRequest,
    @Body() body: { description: string; date: string; locationName?: string },
  ) {
    return this.projectSuggestionService.suggestProject(req.accountId, body);
  }

  @Post('suggest-splits')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('split_suggestion', 1.0)
  async suggestSplits(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      id: string;
      description: string;
      amount: number;
      items?: Array<{ description: string; totalPrice: number }>;
    },
  ) {
    return this.splitSuggestionService.suggestSplits(req.accountId, body);
  }
}
