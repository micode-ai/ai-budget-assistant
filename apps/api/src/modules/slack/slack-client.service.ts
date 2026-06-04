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
      blocks: this.buildButtonBlocks(bodyText, buttons),
    });
  }

  /** Post a transient placeholder; returns its message ts (undefined if unconfigured/failed). */
  async postPlaceholder(channel: string, text: string): Promise<string | undefined> {
    if (!this.isConfigured()) return undefined;
    try {
      const res = await this.client.chat.postMessage({ channel, text, mrkdwn: true });
      return res.ts as string | undefined;
    } catch (err) {
      this.logger.warn(`postPlaceholder failed: ${err}`);
      return undefined;
    }
  }

  /** Replace a message's content with plain text (renders mrkdwn; no blocks field so Slack shows the text body in-channel). */
  async updateText(channel: string, ts: string, text: string): Promise<void> {
    if (!this.isConfigured()) return;
    await this.client.chat.update({ channel, ts, text });
  }

  /** Replace a message's content with a Block Kit buttons message. */
  async updateButtons(channel: string, ts: string, bodyText: string, buttons: SlackButton[]): Promise<void> {
    if (!this.isConfigured()) return;
    await this.client.chat.update({ channel, ts, text: bodyText, blocks: this.buildButtonBlocks(bodyText, buttons) });
  }

  /** Reply by UPDATING the placeholder if we have a ts, else send a fresh message. */
  async replyText(channel: string, ts: string | undefined, text: string): Promise<void> {
    if (ts) return this.updateText(channel, ts, text);
    return this.sendText(channel, text);
  }

  async replyButtons(channel: string, ts: string | undefined, bodyText: string, buttons: SlackButton[]): Promise<void> {
    if (ts) return this.updateButtons(channel, ts, bodyText, buttons);
    return this.sendButtons(channel, bodyText, buttons);
  }

  async downloadFile(urlPrivateDownload: string, mimeType: string): Promise<DownloadedFile> {
    return downloadSlackFile(urlPrivateDownload, this.botToken, mimeType);
  }

  /** Build the Block Kit blocks array shared by sendButtons and updateButtons. */
  private buildButtonBlocks(bodyText: string, buttons: SlackButton[]) {
    return [
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
    ];
  }
}
