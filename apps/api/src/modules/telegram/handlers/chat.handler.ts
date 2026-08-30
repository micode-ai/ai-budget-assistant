import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { Markup } from 'telegraf';
import { randomUUID } from 'crypto';
import { ChatService } from '../../ai/services/chat.service';
import { PrismaService } from '../../../database/prisma.service';
import { TelegramLinkService } from '../telegram-link.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { CacheService } from '../../../common/cache/cache.service';
import { BotContext } from '../types';
import { markdownToTelegramHtml } from '../helpers/format-telegram';
import { resolveAccountFromMessage, AccountInfo } from '../helpers/resolve-account';
import { t } from '../helpers/i18n';

interface PendingActionData {
  conversationId: string;
  actionId: string;
}

// Pending confirmation data lives in Redis (like the WhatsApp bot's `wa:pa:*`
// keys), not a module-level Map — an in-memory Map is wiped on every deploy
// restart, silently orphaning any user mid-confirmation.
const PENDING_ACTION_TTL_SEC = 1800;
const pendingActionKey = (shortId: string) => `telegram:pa:${shortId}`;

@Injectable()
export class ChatHandler {
  private readonly logger = new Logger(ChatHandler.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly linkService: TelegramLinkService,
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly cache: CacheService,
  ) {}

  async handleText(ctx: BotContext): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.reply(t('linkFirst', ctx.from?.language_code), { parse_mode: 'HTML' });
        return;
      }

      const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
      if (!text) return;

      await ctx.sendChatAction('typing');

      await this.processMessage(ctx, text);
    } catch (error) {
      this.logger.error(`Error in chat handler: ${error}`);
      await ctx.reply(t('somethingWrong', ctx.userState?.language));
    }
  }

  async processMessage(ctx: BotContext, messageText: string): Promise<void> {
    const { userId, accountId, conversationId, telegramUserId } = ctx.userState!;

    // Resolve account from message text (e.g., "в счёте Family")
    let effectiveAccountId = accountId;
    let effectiveAccountName: string | null = null;

    const memberships = await this.prisma.accountMember.findMany({
      where: { userId },
      include: { account: { select: { id: true, name: true, currencyCode: true } } },
    });

    if (memberships.length > 1) {
      const accounts: AccountInfo[] = memberships.map((m) => ({
        id: m.account.id,
        name: m.account.name,
        currencyCode: m.account.currencyCode,
      }));
      const resolved = resolveAccountFromMessage(messageText, accounts, accountId);
      effectiveAccountId = resolved.resolvedAccountId;
      effectiveAccountName = resolved.resolvedAccountName;
    }

    // Track AI usage (1.0 for chat)
    try {
      await this.subscriptionsService.trackAiUsage(userId, 'chat', 1.0, effectiveAccountId);
    } catch (e) {
      if (e instanceof ForbiddenException) {
        await ctx.reply(t('aiLimitReached', ctx.userState?.language));
        return;
      }
      throw e;
    }

    const response = await this.chatService.chat(
      userId,
      messageText,
      conversationId || undefined,
      effectiveAccountId,
      effectiveAccountName,
    ) as { message: string; conversationId: string; pendingAction?: { id: string; displaySummary: string }; actionResult?: unknown };

    // Persist conversation ID for continuity
    if (response.conversationId && response.conversationId !== conversationId) {
      await this.linkService.updateConversationId(telegramUserId, response.conversationId);
    }

    // Handle pending action (write action needing confirmation)
    if (response.pendingAction) {
      const { id: actionId } = response.pendingAction;

      // Use short ID to stay under Telegram's 64-byte callback_data limit
      const shortId = randomUUID().slice(0, 8);
      await this.cache.set<PendingActionData>(
        pendingActionKey(shortId),
        { conversationId: response.conversationId, actionId },
        PENDING_ACTION_TTL_SEC,
      );

      const callbackConfirm = `ca:${shortId}`;
      const callbackReject = `ra:${shortId}`;

      const messageHtml = markdownToTelegramHtml(response.message);

      await ctx.reply(
        messageHtml,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            Markup.button.callback(t('confirm', ctx.userState?.language), callbackConfirm),
            Markup.button.callback(t('cancel', ctx.userState?.language), callbackReject),
          ]),
        },
      );
      return;
    }

    // Handle action result (read action executed immediately) or plain text
    const messageHtml = markdownToTelegramHtml(response.message);
    await ctx.reply(messageHtml, { parse_mode: 'HTML' });
  }

  async handleConfirmCallback(ctx: BotContext, shortId: string): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.answerCbQuery('Session expired. Please send a new message.');
        return;
      }

      const actionData = await this.cache.get<PendingActionData>(pendingActionKey(shortId));
      if (!actionData) {
        await ctx.answerCbQuery('Action expired. Please send a new message.');
        return;
      }

      await ctx.answerCbQuery('Processing...');

      try {
        await this.subscriptionsService.trackAiUsage(ctx.userState.userId, 'chat', 0.5, ctx.userState.accountId);
      } catch (e) {
        if (e instanceof ForbiddenException) {
          await ctx.answerCbQuery('AI request limit reached.');
          return;
        }
        throw e;
      }

      const result = await this.chatService.confirmAction(
        ctx.userState.userId,
        actionData.conversationId,
        actionData.actionId,
        ctx.userState.accountId,
      );

      await this.cache.del(pendingActionKey(shortId));

      const html = markdownToTelegramHtml(result.message);
      await ctx.editMessageText(html, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error(`Error confirming action: ${error}`);
      await ctx.answerCbQuery('Failed to confirm. Please try again.');
    }
  }

  async handleRejectCallback(ctx: BotContext, shortId: string): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.answerCbQuery('Session expired.');
        return;
      }

      const actionData = await this.cache.get<PendingActionData>(pendingActionKey(shortId));
      if (!actionData) {
        await ctx.answerCbQuery('Action expired.');
        return;
      }

      await ctx.answerCbQuery('Cancelled.');

      const result = await this.chatService.rejectAction(
        ctx.userState.userId,
        actionData.conversationId,
        actionData.actionId,
      );

      await this.cache.del(pendingActionKey(shortId));

      const html = markdownToTelegramHtml(result.message);
      await ctx.editMessageText(html, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error(`Error rejecting action: ${error}`);
      await ctx.answerCbQuery('Failed to cancel.');
    }
  }
}
