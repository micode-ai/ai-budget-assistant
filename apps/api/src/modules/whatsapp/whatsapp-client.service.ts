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

/**
 * A failed Graph API call, carrying the numeric `error.code` parsed from the
 * response body (when the body was JSON shaped like one) so callers (the
 * digest senders) can classify specific codes — e.g. 131026 "message
 * undeliverable" (recipient blocked us) or 131047 "re-engagement message"
 * (outside the 24h customer-service window) — without re-parsing anything.
 * `code` is `null` when the body wasn't parseable Graph-error JSON.
 */
export class WhatsAppGraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | null,
  ) {
    super(message);
    this.name = 'WhatsAppGraphError';
  }
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

  /** Uploads a media file (e.g. the digest's TTS audio) and returns its media id. */
  async uploadMedia(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('WhatsApp client not configured — cannot upload media');
    }

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);

    const res = await fetch(`${this.baseUrl}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}` },
      body: form,
    });
    if (!res.ok) {
      throw await this.toGraphError(res, 'WhatsApp media upload failed');
    }

    const json = (await res.json()) as { id?: string };
    if (!json.id) {
      throw new Error('WhatsApp media upload returned no media id');
    }
    return json.id;
  }

  /** Sends a previously-uploaded media file (see `uploadMedia`) as an audio message. */
  async sendAudio(to: string, mediaId: string): Promise<void> {
    if (!this.isConfigured()) return;
    await this.post({
      messaging_product: 'whatsapp',
      to: this.normalize(to),
      type: 'audio',
      audio: { id: mediaId },
    });
  }

  /**
   * Sends an approved template message with a single quick-reply button —
   * the only message type Meta allows once the 24h customer-service window
   * has closed. `quickReplyPayload` is what a tap on that button echoes back
   * on the webhook (routed by the callback dispatcher, not this client).
   */
  async sendTemplate(
    to: string,
    name: string,
    languageCode: string,
    quickReplyPayload: string,
  ): Promise<void> {
    if (!this.isConfigured()) return;
    await this.post({
      messaging_product: 'whatsapp',
      to: this.normalize(to),
      type: 'template',
      template: {
        name,
        language: { code: languageCode },
        components: [
          {
            type: 'button',
            sub_type: 'quick_reply',
            index: '0',
            parameters: [{ type: 'payload', payload: quickReplyPayload }],
          },
        ],
      },
    });
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
      throw await this.toGraphError(res, 'WhatsApp send failed');
    }
  }

  /**
   * Builds the error to throw for a failed Graph response: logs status +
   * parsed code only (never the body — it can echo back request content),
   * and carries the numeric `error.code` for callers to classify.
   */
  private async toGraphError(res: Response, label: string): Promise<WhatsAppGraphError> {
    let code: number | null = null;
    try {
      const text = await res.text();
      const parsed = JSON.parse(text) as { error?: { code?: number } };
      code = typeof parsed?.error?.code === 'number' ? parsed.error.code : null;
    } catch {
      // Body wasn't parseable Graph-error JSON — code stays null.
    }
    this.logger.error(`${label}: status=${res.status} code=${code ?? 'unknown'}`);
    return new WhatsAppGraphError(`${label}: ${res.status}`, res.status, code);
  }
}
