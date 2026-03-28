import { Logger, ForbiddenException } from '@nestjs/common';
import { WhisperService } from '../../ai/services/whisper.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { ChatHandler } from './chat.handler';
import { BotContext } from '../types';
import { downloadFile } from '../helpers/download-file';
import { t } from '../helpers/i18n';

export class VoiceHandler {
  private readonly logger = new Logger(VoiceHandler.name);

  constructor(
    private readonly whisperService: WhisperService,
    private readonly chatHandler: ChatHandler,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async handle(ctx: BotContext): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.reply(t('linkFirst', ctx.from?.language_code), { parse_mode: 'HTML' });
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

      // Track AI usage for voice transcription (1.0)
      try {
        await this.subscriptionsService.trackAiUsage(ctx.userState.userId, 'voice', 1.0, ctx.userState.accountId);
      } catch (e) {
        if (e instanceof ForbiddenException) {
          await ctx.reply(t('aiLimitReached', ctx.userState?.language));
          return;
        }
        throw e;
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
        await ctx.reply(t('speechNotRecognized', ctx.userState?.language));
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
      await ctx.reply(t('voiceFailed', ctx.userState?.language));
    }
  }
}
