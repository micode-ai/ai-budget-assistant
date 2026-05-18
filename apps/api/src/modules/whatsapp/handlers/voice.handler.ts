import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { WhisperService } from '../../ai/services/whisper.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { WhatsAppClientService } from '../whatsapp-client.service';
import { ChatHandler } from './chat.handler';
import { WaMediaMessage, WhatsAppUserState } from '../types';
import { t } from '../helpers/i18n';

@Injectable()
export class VoiceHandler {
  private readonly logger = new Logger(VoiceHandler.name);

  constructor(
    private readonly whisperService: WhisperService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly whatsAppClient: WhatsAppClientService,
    private readonly chatHandler: ChatHandler,
  ) {}

  async handle(msg: WaMediaMessage, userState: WhatsAppUserState): Promise<void> {
    const { userId, accountId, waPhoneNumber, language } = userState;

    try {
      // Step 1: resolve media reference — voice messages use msg.voice, uploaded audio uses msg.audio
      const media = msg.voice ?? msg.audio;
      if (!media) {
        this.logger.warn(`VoiceHandler: no voice/audio in message ${msg.id}`);
        return;
      }

      // Step 2: track AI usage (2.0 for voice) BEFORE downloading — cheap fast-fail
      try {
        await this.subscriptionsService.trackAiUsage(userId, 'voice', 2.0, accountId);
      } catch (e) {
        if (e instanceof ForbiddenException) {
          await this.whatsAppClient.sendText(waPhoneNumber, t('aiLimitReached', language));
          return;
        }
        throw e;
      }

      // Step 3: download the media bytes
      const { buffer, mimeType } = await this.whatsAppClient.downloadMedia(media.id);

      // Step 4: transcribe with Whisper — pass mimeType so the service skips magic-byte detection
      const transcription = await this.whisperService.transcribe(buffer, undefined, mimeType);

      // Step 5: guard empty transcript
      if (!transcription.text || transcription.text.trim().length === 0) {
        await this.whatsAppClient.sendText(waPhoneNumber, t('speechNotRecognized', language));
        return;
      }

      const transcript = transcription.text.trim();

      // Step 6: echo the transcript so the user sees what was understood
      await this.whatsAppClient.sendText(waPhoneNumber, `🎤 _"${transcript}"_`);

      // Step 7: dispatch transcript through ChatHandler as if the user typed it
      await this.chatHandler.handleText(transcript, userState);
    } catch (error) {
      this.logger.error(`VoiceHandler error for ${waPhoneNumber}: ${error}`);
      await this.whatsAppClient.sendText(waPhoneNumber, t('voiceFailed', language));
    }
  }
}
