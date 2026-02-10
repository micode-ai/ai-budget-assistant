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

@Controller('ai')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class AiController {
  constructor(
    private readonly whisperService: WhisperService,
    private readonly chatService: ChatService,
    private readonly categorizationService: CategorizationService,
    private readonly ocrService: OcrService,
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
    return this.chatService.chat(req.user.id, body.message, body.conversationId);
  }

  @Post('scan-receipt')
  @UseGuards(AiUsageGuard)
  @TrackAiUsage('ocr', 2.0)
  async scanReceipt(
    @Req() req: AuthenticatedRequest,
    @Body() body: { imageBase64: string },
  ) {
    return this.ocrService.parseReceipt(body.imageBase64, req.user.id, req.accountId);
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
}
