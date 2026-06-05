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
    const teamId = userState.slackTeamId;
    let ts: string | undefined;

    try {
      // Step 1: track AI usage (2.0 for voice) BEFORE downloading — cheap fast-fail
      try {
        await this.subscriptionsService.trackAiUsage(userId, 'voice', 2.0, accountId);
      } catch (e) {
        if (e instanceof ForbiddenException) {
          await this.slackClient.sendText(teamId, channel, t('aiLimitReached', language));
          return;
        }
        throw e;
      }

      // Step 2: download the file bytes via Slack private URL
      const url = file.url_private_download;
      if (!url) {
        this.logger.warn(`Voice file ${file.id} has no url_private_download`);
        await this.slackClient.sendText(teamId, channel, t('voiceFailed', language));
        return;
      }

      // Post placeholder now that we know we're going to Whisper — the slow part
      ts = await this.slackClient.postPlaceholder(teamId, channel, t('thinking', language));

      const { buffer, mimeType } = await this.slackClient.downloadFile(
        teamId,
        url,
        file.mimetype,
      );

      // Step 3: transcribe with Whisper — pass mimeType so the service skips magic-byte detection
      const transcription = await this.whisperService.transcribe(buffer, undefined, mimeType);

      // Step 4: guard empty transcript
      if (!transcription.text || transcription.text.trim().length === 0) {
        await this.slackClient.replyText(teamId, channel, ts, t('speechNotRecognized', language));
        return;
      }

      const transcript = transcription.text.trim();

      // Step 5: Turn the placeholder into the permanent transcript echo so the user
      // can verify what Whisper heard, then let the chat handler post its own fresh
      // "thinking" slot and ultimately the AI answer.
      const echo = `🎤 _"${transcript}"_`;
      if (ts) {
        await this.slackClient.updateText(teamId, userState.channel, ts, echo);
      } else {
        await this.slackClient.sendText(teamId, userState.channel, echo);
      }
      await this.chatHandler.handleText(transcript, userState);
    } catch (error) {
      this.logger.error(`VoiceHandler error for ${channel}: ${error}`);
      await this.slackClient.replyText(teamId, channel, ts, t('voiceFailed', language));
    }
  }
}
