import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
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
  async transcribe(
    @Body() body: { audio: string; language?: string },
  ) {
    const buffer = Buffer.from(body.audio, 'base64');
    return this.whisperService.transcribe(buffer, body.language);
  }

  @Post('parse-expense')
  async parseExpense(
    @Req() req: AuthenticatedRequest,
    @Body() body: { text: string },
  ) {
    return this.categorizationService.parseExpenseFromText(body.text, req.user.id, req.accountId);
  }

  @Post('categorize')
  async categorize(
    @Req() req: AuthenticatedRequest,
    @Body() body: { description: string },
  ) {
    return this.categorizationService.categorize(body.description, req.user.id, req.accountId);
  }

  @Post('chat')
  async chat(
    @Req() req: AuthenticatedRequest,
    @Body() body: { message: string; conversationId?: string },
  ) {
    return this.chatService.chat(req.user.id, body.message, body.conversationId);
  }

  @Post('scan-receipt')
  async scanReceipt(
    @Req() req: AuthenticatedRequest,
    @Body() body: { imageBase64: string },
  ) {
    return this.ocrService.parseReceipt(body.imageBase64, req.user.id, req.accountId);
  }

  @Post('extract-text')
  async extractText(@Body() body: { imageBase64: string }) {
    return { text: await this.ocrService.extractTextFromImage(body.imageBase64) };
  }
}
