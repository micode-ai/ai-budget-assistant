import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { WhisperService } from './services/whisper.service';
import { ChatService } from './services/chat.service';
import { CategorizationService } from './services/categorization.service';
import { OcrService } from './services/ocr.service';

@Module({
  controllers: [AiController],
  providers: [WhisperService, ChatService, CategorizationService, OcrService],
  exports: [WhisperService, ChatService, CategorizationService, OcrService],
})
export class AiModule {}
