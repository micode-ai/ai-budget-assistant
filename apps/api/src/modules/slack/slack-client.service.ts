import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import { downloadSlackFile, DownloadedFile } from './helpers/download-file';
import { SlackInstallationService } from './slack-installation.service';

export interface SlackButton {
  id: string; // becomes action_id + value
  title: string;
}

@Injectable()
export class SlackClientService {
  private readonly logger = new Logger(SlackClientService.name);
  private readonly envBotToken: string;
  private readonly clients = new Map<string, WebClient>(); // token -> WebClient
  private readonly botUserIdByToken = new Map<string, string>(); // env-fallback bot user id cache

  constructor(
    config: ConfigService,
    private readonly installations: SlackInstallationService,
  ) {
    this.envBotToken = config.get<string>('SLACK_BOT_TOKEN') || '';
  }

  /** True if at least the env token exists (original workspace) — used by callers that gate on "any Slack config". */
  isConfigured(): boolean {
    return Boolean(this.envBotToken);
  }

  /** Resolve the bot token for a team: OAuth installation first, else env fallback (original workspace). */
  private async tokenFor(teamId: string): Promise<string> {
    const installed = await this.installations.getToken(teamId);
    return installed || this.envBotToken;
  }

  private clientForToken(token: string): WebClient {
    let c = this.clients.get(token);
    if (!c) {
      c = new WebClient(token);
      this.clients.set(token, c);
    }
    return c;
  }

  /** WebClient for the team, or null if no token is available. */
  private async clientFor(teamId: string): Promise<WebClient | null> {
    const token = await this.tokenFor(teamId);
    if (!token) {
      this.logger.warn(`No Slack bot token for team ${teamId} — skipping outbound`);
      return null;
    }
    return this.clientForToken(token);
  }

  /** Bot user id for the team (installation value, else env-token auth.test, cached). '' if unknown. */
  async getBotUserId(teamId: string): Promise<string> {
    const installed = await this.installations.getBotUserId(teamId);
    if (installed) return installed;
    if (!this.envBotToken) return '';
    const cached = this.botUserIdByToken.get(this.envBotToken);
    if (cached) return cached;
    try {
      const res = await this.clientForToken(this.envBotToken).auth.test();
      const id = (res.user_id as string) || '';
      this.botUserIdByToken.set(this.envBotToken, id);
      return id;
    } catch (err) {
      this.logger.error(`auth.test failed: ${err}`);
      return '';
    }
  }

  async sendText(teamId: string, channel: string, text: string): Promise<void> {
    const c = await this.clientFor(teamId);
    if (!c) return;
    await c.chat.postMessage({ channel, text, mrkdwn: true });
  }

  async sendButtons(teamId: string, channel: string, bodyText: string, buttons: SlackButton[]): Promise<void> {
    const c = await this.clientFor(teamId);
    if (!c) return;
    await c.chat.postMessage({ channel, text: bodyText, blocks: this.buildButtonBlocks(bodyText, buttons) });
  }

  async postPlaceholder(teamId: string, channel: string, text: string): Promise<string | undefined> {
    const c = await this.clientFor(teamId);
    if (!c) return undefined;
    try {
      const res = await c.chat.postMessage({ channel, text, mrkdwn: true });
      return res.ts as string | undefined;
    } catch (err) {
      this.logger.warn(`postPlaceholder failed: ${err}`);
      return undefined;
    }
  }

  async updateText(teamId: string, channel: string, ts: string, text: string): Promise<void> {
    const c = await this.clientFor(teamId);
    if (!c) return;
    await c.chat.update({ channel, ts, text });
  }

  async updateButtons(teamId: string, channel: string, ts: string, bodyText: string, buttons: SlackButton[]): Promise<void> {
    const c = await this.clientFor(teamId);
    if (!c) return;
    await c.chat.update({ channel, ts, text: bodyText, blocks: this.buildButtonBlocks(bodyText, buttons) });
  }

  async replyText(teamId: string, channel: string, ts: string | undefined, text: string): Promise<void> {
    if (ts) return this.updateText(teamId, channel, ts, text);
    return this.sendText(teamId, channel, text);
  }

  async replyButtons(teamId: string, channel: string, ts: string | undefined, bodyText: string, buttons: SlackButton[]): Promise<void> {
    if (ts) return this.updateButtons(teamId, channel, ts, bodyText, buttons);
    return this.sendButtons(teamId, channel, bodyText, buttons);
  }

  async downloadFile(teamId: string, urlPrivateDownload: string, mimeType: string): Promise<DownloadedFile> {
    const token = await this.tokenFor(teamId);
    return downloadSlackFile(urlPrivateDownload, token, mimeType);
  }

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
