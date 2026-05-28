import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { WhatsAppLinkService } from './whatsapp-link.service';
import { WhatsAppClientService } from './whatsapp-client.service';
import { CommandHandler } from './handlers/command.handler';
import { ChatHandler } from './handlers/chat.handler';
import { ExpenseHandler } from './handlers/expense.handler';
import { IncomeHandler } from './handlers/income.handler';
import { CategoryHandler } from './handlers/category.handler';
import { VoiceHandler } from './handlers/voice.handler';
import { PhotoHandler } from './handlers/photo.handler';
import { parseCommand } from './helpers/parse-command';
import { t } from './helpers/i18n';
import { WA_REDIS, WaMessage, WaWebhookBody, WhatsAppUserState } from './types';

const PHONE_RE = /^\d{7,15}$/;

@Injectable()
export class WhatsAppBotService {
  private readonly logger = new Logger(WhatsAppBotService.name);

  constructor(
    private readonly linkService: WhatsAppLinkService,
    private readonly client: WhatsAppClientService,
    private readonly commandHandler: CommandHandler,
    private readonly chatHandler: ChatHandler,
    private readonly expenseHandler: ExpenseHandler,
    private readonly incomeHandler: IncomeHandler,
    private readonly categoryHandler: CategoryHandler,
    private readonly voiceHandler: VoiceHandler,
    private readonly photoHandler: PhotoHandler,
    @Inject(WA_REDIS) private readonly redis: Redis,
  ) {}

  async handleUpdate(body: WaWebhookBody): Promise<void> {
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    if (!value) return;

    // Ignore statuses[] (delivery/read receipts) — same subscription, not user messages
    const messages = value.messages ?? [];
    if (messages.length === 0) return;

    const contacts = value.contacts ?? [];

    for (const msg of messages) {
      // Defensive filters (spec §4): non-E.164 from, group payloads, catalog interactions
      if (typeof msg.from !== 'string' || !PHONE_RE.test(msg.from)) {
        this.logger.debug(`Skipping message from non-phone: ${msg.from}`);
        continue;
      }
      if (
        msg.type === 'audio' ||
        msg.type === 'voice' ||
        msg.type === 'image' ||
        msg.type === 'document'
      ) {
        // WaMediaMessage may carry `context.referred_product` (catalog) — drop
        if ((msg as { context?: { referred_product?: unknown } }).context?.referred_product) {
          continue;
        }
      }

      const profileName = contacts.find((c) => c.wa_id === msg.from)?.profile?.name;
      await this.processMessage(msg, profileName);
    }
  }

  private async processMessage(msg: WaMessage, profileName?: string): Promise<void> {
    // Idempotency: dedup by message id, 24h TTL
    const setOk = await this.redis.set(`wa:msg:${msg.id}`, '1', 'EX', 86400, 'NX');
    if (setOk !== 'OK') {
      this.logger.debug(`Duplicate inbound dropped: ${msg.id}`);
      return;
    }

    // WhatsApp delivers `from` without leading '+'. Our DB stores E.164 with '+'.
    const waPhone = `+${msg.from}`;

    // Resolve user state from active link, if any
    const link = await this.linkService.getLink(waPhone);
    const userState: WhatsAppUserState | undefined = link
      ? {
          userId: link.userId,
          accountId: link.defaultAccountId,
          accountRole: link.accountRole,
          conversationId: link.conversationId,
          currencyCode: link.user.currencyCode,
          language: link.user.language || 'en',
          waPhoneNumber: waPhone,
        }
      : undefined;

    // Fire-and-forget activity tracking
    if (link) {
      void this.linkService.updateLastInbound(waPhone);
    }

    try {
      await this.dispatch(msg, waPhone, userState, profileName);
    } catch (err) {
      this.logger.error(
        `Handler crash on msg ${msg.id}: ${err instanceof Error ? err.stack || err.message : err}`,
      );
      try {
        await this.client.sendText(waPhone, t('somethingWrong', userState?.language));
      } catch {
        // Last-ditch reply failed too — swallow, already logged
      }
    }
  }

  private async dispatch(
    msg: WaMessage,
    waPhone: string,
    userState: WhatsAppUserState | undefined,
    profileName?: string,
  ): Promise<void> {
    // Interactive replies (button/list taps) — always require a linked user
    if (msg.type === 'interactive') {
      if (!userState) {
        await this.client.sendText(waPhone, t('linkFirst'));
        return;
      }
      const id =
        msg.interactive.type === 'button_reply'
          ? msg.interactive.button_reply.id
          : msg.interactive.list_reply.id;
      await this.routeCallback(id, userState);
      return;
    }

    // Voice / audio
    if (msg.type === 'voice' || msg.type === 'audio') {
      if (!userState) {
        await this.client.sendText(waPhone, t('linkFirst'));
        return;
      }
      await this.voiceHandler.handle(msg, userState);
      return;
    }

    // Image
    if (msg.type === 'image') {
      if (!userState) {
        await this.client.sendText(waPhone, t('linkFirst'));
        return;
      }
      await this.photoHandler.handleImage(msg, userState);
      return;
    }

    // Document
    if (msg.type === 'document') {
      if (!userState) {
        await this.client.sendText(waPhone, t('linkFirst'));
        return;
      }
      await this.photoHandler.handleDocument(msg, userState);
      return;
    }

    // Text — link command (works without user) OR awaiting-date OR commands OR AI chat
    if (msg.type === 'text') {
      const text = msg.text.body;
      const parsed = parseCommand(text);

      // `link CODE` is the only command we accept BEFORE the user is linked
      if (parsed?.command === 'link') {
        await this.commandHandler.handleLink(waPhone, parsed.args, profileName);
        return;
      }

      if (!userState) {
        await this.client.sendText(waPhone, t('welcomeNew', undefined));
        return;
      }

      // Photo handler may be in "awaiting date" mode — check first
      const consumed = await this.photoHandler.handleDateInput(text, userState);
      if (consumed) return;

      if (parsed) {
        switch (parsed.command) {
          case 'expense':
            return this.expenseHandler.handle(parsed.args, userState);
          case 'income':
            return this.incomeHandler.handle(parsed.args, userState);
          case 'help':
            return this.commandHandler.handleHelp(userState);
          case 'unlink':
            return this.commandHandler.handleUnlink(userState);
          case 'account':
          case 'menu':
            return this.commandHandler.handleAccount(userState);
          case 'newchat':
            return this.commandHandler.handleNewChat(userState);
          case 'usage':
            return this.commandHandler.handleUsage(userState);
          case 'category':
            return this.categoryHandler.handle(parsed.args, userState);
          case 'categories':
            return this.categoryHandler.handleList(userState);
        }
      }

      // Anything else → AI chat
      await this.chatHandler.handleText(text, userState);
    }
  }

  private async routeCallback(id: string, userState: WhatsAppUserState): Promise<void> {
    const sepIdx = id.indexOf('--');
    if (sepIdx < 0) {
      this.logger.warn(`Callback id missing '--' separator: ${id}`);
      return;
    }
    const prefix = id.slice(0, sepIdx);
    const payload = id.slice(sepIdx + 2);

    switch (prefix) {
      case 'ca':
        return this.chatHandler.handleConfirmCallback(payload, userState);
      case 'ra':
        return this.chatHandler.handleRejectCallback(payload, userState);
      case 'account':
        return this.commandHandler.handleAccountCallback(payload, userState);
      case 'cat_e':
        return this.categoryHandler.handleTypeCallback('expense', payload, userState);
      case 'cat_i':
        return this.categoryHandler.handleTypeCallback('income', payload, userState);
      case 'cat_d':
        return this.categoryHandler.handleDeleteCallback(payload, userState);
      case 'receipt_add':
        return this.photoHandler.handleReceiptAddCallback(payload, userState);
      case 'receipt_date':
        return this.photoHandler.handleDateCallback(payload, userState);
      case 'receipt_cancel':
        return this.photoHandler.handleReceiptCancelCallback(payload, userState);
      default:
        this.logger.warn(`Unknown callback prefix: ${prefix}`);
    }
  }
}

