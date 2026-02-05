import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WhisperService } from './services/whisper.service';
import { ChatService } from './services/chat.service';
import { CategorizationService } from './services/categorization.service';
import { OcrService } from './services/ocr.service';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string };
}

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly whisperService: WhisperService,
    private readonly chatService: ChatService,
    private readonly categorizationService: CategorizationService,
    private readonly ocrService: OcrService,
  ) {}

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio'))
  async transcribe(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { language?: string },
  ) {
    return this.whisperService.transcribe(file.buffer, body.language);
  }

  @Post('parse-expense')
  async parseExpense(
    @Req() req: AuthenticatedRequest,
    @Body() body: { text: string },
  ) {
    return this.categorizationService.parseExpenseFromText(body.text, req.user.id);
  }

  @Post('categorize')
  async categorize(
    @Req() req: AuthenticatedRequest,
    @Body() body: { description: string },
  ) {
    return this.categorizationService.categorize(body.description, req.user.id);
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
    return this.ocrService.parseReceipt(body.imageBase64, req.user.id);
  }

  @Post('extract-text')
  async extractText(@Body() body: { imageBase64: string }) {
    return { text: await this.ocrService.extractTextFromImage(body.imageBase64) };
  }
}
