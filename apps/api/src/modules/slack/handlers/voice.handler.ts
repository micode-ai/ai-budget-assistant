import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { WhisperService } from '../../ai/services/whisper.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { SlackClientService } from '../slack-client.service';
import { ChatHandler } from './chat.handler';
import { SlackFile, SlackUserState } from '../types';
import { t } from '../helpers/i18n';

@Injectable()
export class VoiceHandler {
  private readonly logger = new Logger(VoiceHandler.name);

  constructor(
    private readonly whisperService: WhisperService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly slackClient: SlackClientService,
    private readonly chatHandler: ChatHandler,
  ) {}

  async handle(file: SlackFile, userState: SlackUserState): Promise<void> {
    const { userId, accountId, channel, language } = userState;

    try {
      // Step 1: track AI usage (2.0 for voice) BEFORE downloading — cheap fast-fail
      try {
        await this.subscriptionsService.trackAiUsage(userId, 'voice', 2.0, accountId);
      } catch (e) {
        if (e instanceof ForbiddenException) {
          await this.slackClient.sendText(channel, t('aiLimitReached', language));
          return;
        }
        throw e;
      }

      // Step 2: download the file bytes via Slack private URL
      const url = file.url_private_download;
      if (!url) {
        this.logger.warn(`Voice file ${file.id} has no url_private_download`);
        await this.slackClient.sendText(channel, t('voiceFailed', language));
        return;
      }
      const { buffer, mimeType } = await this.slackClient.downloadFile(
        url,
        file.mimetype,
      );

      // Step 3: transcribe with Whisper — pass mimeType so the service skips magic-byte detection
      const transcription = await this.whisperService.transcribe(buffer, undefined, mimeType);

      // Step 4: guard empty transcript
      if (!transcription.text || transcription.text.trim().length === 0) {
        await this.slackClient.sendText(channel, t('speechNotRecognized', language));
        return;
      }

      const transcript = transcription.text.trim();

      // Step 5: echo the transcript so the user sees what was understood
      await this.slackClient.sendText(channel, `🎤 _"${transcript}"_`);

      // Step 6: dispatch transcript through ChatHandler as if the user typed it
      await this.chatHandler.handleText(transcript, userState);
    } catch (error) {
      this.logger.error(`VoiceHandler error for ${channel}: ${error}`);
      await this.slackClient.sendText(channel, t('voiceFailed', language));
    }
  }
}
