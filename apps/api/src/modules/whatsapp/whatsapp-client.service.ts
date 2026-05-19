import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { downloadMedia, DownloadedMedia } from './helpers/download-media';

export interface WaButton {
  id: string;
  title: string;
}

export interface WaListRow {
  id: string;
  title: string;
  description?: string;
}

@Injectable()
export class WhatsAppClientService {
  private readonly logger = new Logger(WhatsAppClientService.name);
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    const apiVersion = config.get<string>('WHATSAPP_API_VERSION') || 'v21.0';
    this.accessToken = config.get<string>('WHATSAPP_ACCESS_TOKEN') || '';
    this.phoneNumberId = config.get<string>('WHATSAPP_PHONE_NUMBER_ID') || '';
    this.baseUrl = `https://graph.facebook.com/${apiVersion}/${this.phoneNumberId}`;
  }

  isConfigured(): boolean {
    return Boolean(this.accessToken && this.phoneNumberId);
  }

  async sendText(to: string, body: string): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn('WhatsApp client not configured — skipping outbound message');
      return;
    }
    await this.post({
      messaging_product: 'whatsapp',
      to: this.normalize(to),
      type: 'text',
      text: { body, preview_url: false },
    });
  }

  async sendButtons(to: string, bodyText: string, buttons: WaButton[]): Promise<void> {
    if (buttons.length === 0 || buttons.length > 3) {
      throw new Error(`WhatsApp interactive buttons require 1-3 entries (got ${buttons.length})`);
    }
    if (!this.isConfigured()) return;

    await this.post({
      messaging_product: 'whatsapp',
      to: this.normalize(to),
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    });
  }

  async sendList(
    to: string,
    bodyText: string,
    buttonLabel: string,
    rows: WaListRow[],
  ): Promise<void> {
    if (rows.length === 0 || rows.length > 10) {
      throw new Error(`WhatsApp list-message rows must be 1-10 (got ${rows.length})`);
    }
    if (!this.isConfigured()) return;

    await this.post({
      messaging_product: 'whatsapp',
      to: this.normalize(to),
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText },
        action: {
          button: buttonLabel.slice(0, 20),
          sections: [
            {
              rows: rows.map((r) => ({
                id: r.id,
                title: r.title.slice(0, 24),
                description: r.description?.slice(0, 72),
              })),
            },
          ],
        },
      },
    });
  }

  async downloadMedia(mediaId: string): Promise<DownloadedMedia> {
    return downloadMedia(mediaId, this.accessToken);
  }

  /**
   * WhatsApp expects the recipient phone in E.164 *without* a leading '+'.
   * Webhook payloads also come without '+'. Strip it defensively.
   */
  private normalize(to: string): string {
    return to.startsWith('+') ? to.slice(1) : to;
  }

  private async post(body: unknown): Promise<void> {
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`WhatsApp send failed ${res.status}: ${text}`);
      throw new Error(`WhatsApp send failed: ${res.status}`);
    }
  }
}
