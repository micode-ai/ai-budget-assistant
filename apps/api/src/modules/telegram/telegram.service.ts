import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { logFireAndForget } from '../../common/utils/fire-and-forget';

/**
 * Ops notifier for MiCode. Sends operational alerts (registrations, payments,
 * referrals, request-a-bank) to the SEPARATE MiCode ops bot + channel
 * (`OPS_TELEGRAM_BOT_TOKEN` / `OPS_TELEGRAM_CHAT_ID`) — NOT the user-facing
 * assistant bot (`TELEGRAM_BOT_TOKEN`, handled by `TelegramBotService`). There
 * is deliberately no fallback to the assistant bot: if the ops bot is not
 * configured, ops notifications are skipped so they can never leak back to the
 * bot end users talk to.
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string | undefined;
  private readonly chatId: string | undefined;
  private readonly projectPrefix: string;

  constructor(private readonly config: ConfigService) {
    this.botToken = this.config.get<string>('OPS_TELEGRAM_BOT_TOKEN');
    this.chatId = this.config.get<string>('OPS_TELEGRAM_CHAT_ID');
    // Optional label so a shared MiCode ops channel can tell projects apart.
    const name = this.config.get<string>('OPS_PROJECT_NAME')?.trim();
    this.projectPrefix = name ? `<b>[${name}]</b> ` : '';

    if (this.botToken && this.chatId) {
      this.logger.log('Ops Telegram notifications configured');
    } else {
      this.logger.warn('Ops Telegram bot not configured — ops notifications will not be sent');
    }
  }

  async sendMessage(text: string): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      this.logger.warn('Telegram message skipped (not configured)');
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: `${this.projectPrefix}${text}`,
          parse_mode: 'HTML',
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`Telegram API error (${res.status}): ${body}`);
        return false;
      }

      this.logger.log('Telegram message sent');
      return true;
    } catch (error) {
      this.logger.error(`Failed to send Telegram message: ${error}`);
      return false;
    }
  }

  /** Send a document (e.g. a user-submitted sample bank statement) to the ops chat. */
  async sendDocument(buffer: Buffer, filename: string, caption: string): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      this.logger.warn('Telegram document skipped (not configured)');
      return false;
    }

    try {
      const form = new FormData();
      form.append('chat_id', this.chatId);
      const cap = `${this.projectPrefix}${caption || ''}`.trim();
      if (cap) {
        form.append('caption', cap.slice(0, 1024));
        form.append('parse_mode', 'HTML');
      }
      form.append('document', new Blob([new Uint8Array(buffer)]), filename || 'document');

      const url = `https://api.telegram.org/bot${this.botToken}/sendDocument`;
      const res = await fetch(url, { method: 'POST', body: form });

      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`Telegram sendDocument error (${res.status}): ${body}`);
        return false;
      }

      this.logger.log('Telegram document sent');
      return true;
    } catch (error) {
      this.logger.error(`Failed to send Telegram document: ${error}`);
      return false;
    }
  }

  notifyNewUser(name: string, email: string): void {
    const text = `🆕 <b>New user registered</b>\n\nName: ${name}\nEmail: ${email}`;
    this.sendMessage(text).catch(logFireAndForget(this.logger, 'TelegramService.notifyNewUser'));
  }

  notifyNewSubscription(
    userName: string,
    userEmail: string,
    tier: string,
  ): void {
    const text = `💰 <b>New subscription</b>\n\nUser: ${userName}\nEmail: ${userEmail}\nPlan: ${tier.toUpperCase()}`;
    this.sendMessage(text).catch(logFireAndForget(this.logger, 'TelegramService.notifyNewSubscription'));
  }
}
