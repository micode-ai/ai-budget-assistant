import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, timingSafeEqual } from 'crypto';
import type { SupportMessage, SupportThread } from '@prisma/client';
import type { SupportContext } from '@budget/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { SupportAdminService } from './support-admin.service';
import type { SupportForwarder, SupportForwarderUser } from './support-forwarder';

const TG_LIMIT = 4096;
const DEFAULT_ADMIN_URL = 'https://admin.ai-budget.pl';

const MSG_NEED_REPLY = 'Ответьте реплаем на карточку пользователя — так я пойму, кому отправить.';
const MSG_MUTED = 'Пользователь заглушён — ответ не отправлен.';
const MSG_CARD_GONE = 'Карточка не найдена — возможно, пользователь удалил аккаунт. Ответ не отправлен.';
const MSG_TOO_LONG = 'Ответ длиннее 4000 символов — сократите, пожалуйста.';
const REPLY_MAX = 4000;
const MSG_INACTIVE = 'Пользователь удалил аккаунт — ответ не отправлен.';

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Cuts already-escaped text to `max` chars without leaving half an entity (`&am`) at the end. */
const cutEscaped = (escaped: string, max: number): string => {
  if (escaped.length <= max) return escaped;
  const cut = escaped.slice(0, Math.max(0, max - 1));
  return cut.replace(/&[a-z#0-9]{0,5}$/i, '') + '…';
};

interface TgUpdate {
  update_id?: number;
  message?: {
    message_id: number;
    chat?: { id: number | string };
    text?: string;
    reply_to_message?: { message_id: number };
  };
}

/**
 * Support bot: a SEPARATE Telegram bot (own token + webhook) that forwards user messages to the
 * developer's private chat and turns the developer's Telegram replies into support replies.
 * Never shares anything with the ops notifier (`TelegramService`) or the assistant bot.
 */
@Injectable()
export class SupportTelegramService implements SupportForwarder, OnModuleInit {
  private readonly logger = new Logger(SupportTelegramService.name);
  private readonly token?: string;
  private readonly chatId?: string;
  private readonly webhookUrl?: string;
  private readonly secret: string;
  private readonly adminUrl: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly admin: SupportAdminService,
  ) {
    this.token = config.get<string>('SUPPORT_TELEGRAM_BOT_TOKEN') || undefined;
    this.chatId = config.get<string>('SUPPORT_TELEGRAM_CHAT_ID') || undefined;
    this.webhookUrl = config.get<string>('SUPPORT_TELEGRAM_WEBHOOK_URL') || undefined;
    // Unset secret: a random per-process one, so the public webhook never runs unauthenticated
    // AND the registered secret_token always matches what verifySecret accepts.
    this.secret = config.get<string>('SUPPORT_TELEGRAM_WEBHOOK_SECRET') || randomBytes(32).toString('hex');
    this.adminUrl = (config.get<string>('SUPPORT_ADMIN_URL') || DEFAULT_ADMIN_URL).replace(/\/+$/, '');
  }

  async onModuleInit(): Promise<void> {
    if (!this.token || !this.webhookUrl) {
      this.logger.log('Support Telegram bot not configured - webhook not registered');
      return;
    }
    try {
      await this.call('setWebhook', {
        url: `${this.webhookUrl.replace(/\/+$/, '')}/support-telegram/webhook`,
        secret_token: this.secret,
        allowed_updates: ['message'],
      });
    } catch (err) {
      this.logger.warn(`Support Telegram setWebhook failed: ${(err as Error).message}`);
    }
  }

  verifySecret(token?: string): boolean {
    if (!token) return false;
    const a = Buffer.from(token);
    const b = Buffer.from(this.secret);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async forwardUserMessage(message: SupportMessage, thread: SupportThread, user: SupportForwarderUser): Promise<void> {
    if (!this.token || !this.chatId) {
      this.logger.warn('Support Telegram skipped (not configured)');
      return;
    }
    const text = this.buildCard(message, thread.id, user.name, user.id);
    const result = await this.call<{ message_id: number }>('sendMessage', {
      chat_id: this.chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    if (result?.message_id !== undefined) {
      await this.prisma.supportMessage.update({
        where: { id: message.id },
        data: { telegramMessageId: BigInt(result.message_id) },
      });
    }
  }

  async handleUpdate(update: unknown): Promise<void> {
    const msg = (update as TgUpdate | null)?.message;
    if (!msg || !this.chatId || String(msg.chat?.id) !== String(this.chatId)) return;

    const replyTo = msg.reply_to_message?.message_id;
    if (typeof msg.text !== 'string' || !msg.text.trim() || replyTo === undefined) {
      await this.say(MSG_NEED_REPLY, msg.message_id);
      return;
    }
    if (msg.text.length > REPLY_MAX) {
      await this.say(MSG_TOO_LONG, msg.message_id);
      return;
    }

    const card = await this.prisma.supportMessage.findUnique({
      where: { telegramMessageId: BigInt(replyTo) },
      select: { threadId: true, thread: { select: { muted: true, user: { select: { name: true } } } } },
    });
    if (!card) {
      await this.say(MSG_CARD_GONE, msg.message_id);
      return;
    }
    if (card.thread.muted) {
      await this.say(MSG_MUTED, msg.message_id);
      return;
    }

    const name = card.thread.user.name;
    try {
      const sent = await this.admin.reply(card.threadId, msg.text, 'telegram');
      const text =
        sent.translatedBody && sent.translatedLang
          ? `✓ Отправлено ${name} · ${sent.translatedLang}: ${sent.translatedBody}`
          : `✓ Отправлено ${name} (без перевода)`;
      await this.say(text, msg.message_id);
    } catch (err) {
      if ((err as Error).message === 'user_inactive') {
        await this.say(MSG_INACTIVE, msg.message_id);
        return;
      }
      throw err;
    }
  }

  private buildCard(m: SupportMessage, threadId: string, name: string, userId: string): string {
    const lang = escapeHtml(m.bodyLang);
    const ctx = (m.context ?? {}) as Partial<SupportContext>;
    const os = [ctx.platform, ctx.osVersion].filter(Boolean).join(' ');
    const ctxLine = [ctx.appVersion, os, ctx.locale, ctx.tier, ctx.fromRoute].filter(Boolean).join(' · ');

    const header = `🆕 <b>${escapeHtml(name)}</b> (${escapeHtml(userId)}) · ${lang}`;
    const footer =
      (ctxLine ? `<i>${escapeHtml(ctxLine)}</i>\n` : '') + `${escapeHtml(`${this.adminUrl}/support?thread=${threadId}`)}`;
    const hasTr = !!m.translatedBody;
    const originalLabel = `— original (${lang}):`;

    // Fixed overhead (header, labels, separators, footer, safety margin); the rest is split between the texts.
    const overhead = header.length + footer.length + (hasTr ? originalLabel.length : 0) + 16;
    const budget = Math.max(0, TG_LIMIT - overhead);
    const first = escapeHtml(hasTr ? (m.translatedBody as string) : m.body);
    const second = hasTr ? escapeHtml(m.body) : '';
    let firstMax = budget;
    let secondMax = 0;
    if (hasTr) {
      const half = Math.floor(budget / 2);
      firstMax = Math.max(half, budget - second.length);
      secondMax = budget - Math.min(first.length, firstMax);
    }

    const parts = [header, cutEscaped(first, firstMax)];
    if (hasTr) parts.push(`${originalLabel}\n${cutEscaped(second, secondMax)}`);
    parts.push(footer);
    return parts.join('\n\n');
  }

  private async say(text: string, replyToMessageId: number): Promise<void> {
    if (!this.chatId) return;
    await this.call('sendMessage', {
      chat_id: this.chatId,
      text: cutEscaped(escapeHtml(text), TG_LIMIT),
      parse_mode: 'HTML',
      reply_to_message_id: replyToMessageId,
    });
  }

  private async call<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T | undefined> {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
    if (!res.ok || !json?.ok) throw new Error(`Telegram ${method} failed: ${json?.description ?? res.status}`);
    return json.result;
  }
}
