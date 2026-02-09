import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string | undefined;
  private readonly chatId: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    this.chatId = this.config.get<string>('TELEGRAM_CHAT_ID');

    if (this.botToken && this.chatId) {
      this.logger.log('Telegram notifications configured');
    } else {
      this.logger.warn('Telegram not configured — notifications will not be sent');
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
          text,
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

  notifyNewUser(name: string, email: string): void {
    const text = `🆕 <b>New user registered</b>\n\nName: ${name}\nEmail: ${email}`;
    this.sendMessage(text).catch(() => {});
  }
}
