import { Logger } from '@nestjs/common';
import { WhisperService } from '../../ai/services/whisper.service';
import { ChatHandler } from './chat.handler';
import { BotContext } from '../types';
import { downloadFile } from '../helpers/download-file';

export class VoiceHandler {
  private readonly logger = new Logger(VoiceHandler.name);

  constructor(
    private readonly whisperService: WhisperService,
    private readonly chatHandler: ChatHandler,
  ) {}

  async handle(ctx: BotContext): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.reply('Please link your account first. Use /link <code>.');
        return;
      }

      // Get the file ID from voice message or audio file
      let fileId: string | undefined;
      if (ctx.message && 'voice' in ctx.message && ctx.message.voice) {
        fileId = ctx.message.voice.file_id;
      } else if (ctx.message && 'audio' in ctx.message && ctx.message.audio) {
        fileId = ctx.message.audio.file_id;
      }

      if (!fileId) {
        await ctx.reply('Could not process the audio. Please try again.');
        return;
      }

      await ctx.sendChatAction('typing');

      // Download file from Telegram
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const buffer = await downloadFile(fileLink.href);

      // Transcribe with Whisper
      const transcription = await this.whisperService.transcribe(
        buffer,
        ctx.userState.language !== 'en' ? ctx.userState.language : undefined,
      );

      if (!transcription.text || transcription.text.trim().length === 0) {
        await ctx.reply('Could not recognize speech. Please try again.');
        return;
      }

      // Send transcription and forward to AI chat
      await ctx.sendChatAction('typing');

      // Forward transcribed text to AI chat for natural language processing
      // AI will decide if it's an expense, income, question, etc.
      await ctx.reply(`🎤 <i>"${transcription.text}"</i>`, { parse_mode: 'HTML' });
      await this.chatHandler.processMessage(ctx, transcription.text);
    } catch (error) {
      this.logger.error(`Error processing voice message: ${error}`);
      await ctx.reply('❌ Could not process the voice message. Please try again.');
    }
  }
}
