import { Injectable, OnModuleInit } from '@nestjs/common';
import { TelegramError } from 'telegraf';
import type { VoiceDigestChannel } from '@budget/shared-types';
import {
  DigestBlockedError,
  DigestChannelRegistry,
  DigestPayload,
  DigestSender,
  DigestUnavailableError,
} from '../../voice-digest/digest-channel.registry';
import { TelegramBotService } from '../telegram-bot.service';
import { TelegramLinkService } from '../telegram-link.service';

/** Telegraf error_code for "bot was blocked by the user". */
const BLOCKED_ERROR_CODE = 403;

@Injectable()
export class TelegramDigestSender implements DigestSender, OnModuleInit {
  readonly channel: VoiceDigestChannel = 'telegram';

  constructor(
    private readonly registry: DigestChannelRegistry,
    private readonly botService: TelegramBotService,
    private readonly linkService: TelegramLinkService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async isLinked(userId: string): Promise<boolean> {
    const link = await this.linkService.getLinkByUserId(userId);
    return link !== null;
  }

  async accountIdFor(userId: string): Promise<string | null> {
    const link = await this.linkService.getLinkByUserId(userId);
    return link?.defaultAccountId ?? null;
  }

  async send(payload: DigestPayload): Promise<'sent' | 'template'> {
    const link = await this.linkService.getLinkByUserId(payload.userId);
    if (!link) {
      throw new DigestUnavailableError('No active Telegram link for user');
    }

    try {
      await this.botService.sendDigest(link.telegramUserId, payload.audio, payload.text);
      return 'sent';
    } catch (err) {
      if (err instanceof DigestUnavailableError) {
        throw err;
      }
      if (this.isBlocked(err)) {
        throw new DigestBlockedError('Telegram recipient blocked the bot');
      }
      throw err;
    }
  }

  private isBlocked(err: unknown): boolean {
    if (err instanceof TelegramError) {
      return err.response?.error_code === BLOCKED_ERROR_CODE;
    }
    // Defensive: a mocked/plain error shaped like Telegraf's without being an
    // actual TelegramError instance (e.g. in tests) should still classify.
    const code = (err as { response?: { error_code?: number } } | null)?.response?.error_code;
    return code === BLOCKED_ERROR_CODE;
  }
}
