import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import { downloadSlackFile, DownloadedFile } from './helpers/download-file';

export interface SlackButton {
  id: string; // becomes action_id + value
  title: string;
}

@Injectable()
export class SlackClientService {
  private readonly logger = new Logger(SlackClientService.name);
  private readonly client: WebClient;
  private readonly botToken: string;
  private botUserId = '';

  constructor(config: ConfigService) {
    this.botToken = config.get<string>('SLACK_BOT_TOKEN') || '';
    this.client = new WebClient(this.botToken);
  }

  isConfigured(): boolean {
    return Boolean(this.botToken);
  }

  /** Cache the bot's own user id once, for loop-guard. Returns '' if unconfigured. */
  async getBotUserId(): Promise<string> {
    if (this.botUserId || !this.isConfigured()) return this.botUserId;
    try {
      const res = await this.client.auth.test();
      this.botUserId = (res.user_id as string) || '';
    } catch (err) {
      this.logger.error(`auth.test failed: ${err}`);
    }
    return this.botUserId;
  }

  async sendText(channel: string, text: string): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn('Slack client not configured — skipping outbound message');
      return;
    }
    await this.client.chat.postMessage({ channel, text, mrkdwn: true });
  }

  /**
   * Send a message with up to a few Block Kit buttons. Each button carries the
   * same string in `action_id` and `value` (we read `action_id` on the way back).
   */
  async sendButtons(channel: string, bodyText: string, buttons: SlackButton[]): Promise<void> {
    if (!this.isConfigured()) return;
    await this.client.chat.postMessage({
      channel,
      text: bodyText,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: bodyText } },
        {
          type: 'actions',
          elements: buttons.map((b) => ({
            type: 'button',
            action_id: b.id,
            value: b.id,
            text: { type: 'plain_text', text: b.title.slice(0, 75) },
          })),
        },
      ],
    });
  }

  async downloadFile(urlPrivateDownload: string, mimeType: string): Promise<DownloadedFile> {
    return downloadSlackFile(urlPrivateDownload, this.botToken, mimeType);
  }
}
