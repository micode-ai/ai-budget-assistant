import { Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import { randomUUID } from 'crypto';
import { ChatService } from '../../ai/services/chat.service';
import { PrismaService } from '../../../database/prisma.service';
import { TelegramLinkService } from '../telegram-link.service';
import { BotContext } from '../types';
import { markdownToTelegramHtml } from '../helpers/format-telegram';
import { resolveAccountFromMessage, AccountInfo } from '../helpers/resolve-account';

// In-memory store for pending action data (keyed by short ID)
// Keeps callback_data under Telegram's 64-byte limit
const pendingActions = new Map<string, { conversationId: string; actionId: string }>();

// Clean up old pending actions (older than 30 minutes)
setInterval(() => {
  // Simple size-based cleanup since we don't track timestamps per entry
  if (pendingActions.size > 1000) {
    const entries = [...pendingActions.keys()];
    for (let i = 0; i < entries.length - 500; i++) {
      pendingActions.delete(entries[i]);
    }
  }
}, 5 * 60 * 1000);

export class ChatHandler {
  private readonly logger = new Logger(ChatHandler.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly linkService: TelegramLinkService,
    private readonly prisma: PrismaService,
  ) {}

  async handleText(ctx: BotContext): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.reply('Please link your account first. Use /link <code>.');
        return;
      }

      const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
      if (!text) return;

      await ctx.sendChatAction('typing');

      await this.processMessage(ctx, text);
    } catch (error) {
      this.logger.error(`Error in chat handler: ${error}`);
      await ctx.reply('❌ Something went wrong. Please try again later.');
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
      pendingActions.set(shortId, { conversationId: response.conversationId, actionId });

      const callbackConfirm = `ca:${shortId}`;
      const callbackReject = `ra:${shortId}`;

      const messageHtml = markdownToTelegramHtml(response.message);

      await ctx.reply(
        messageHtml,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            Markup.button.callback('✅ Confirm', callbackConfirm),
            Markup.button.callback('❌ Cancel', callbackReject),
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

      const actionData = pendingActions.get(shortId);
      if (!actionData) {
        await ctx.answerCbQuery('Action expired. Please send a new message.');
        return;
      }

      await ctx.answerCbQuery('Processing...');

      const result = await this.chatService.confirmAction(
        ctx.userState.userId,
        actionData.conversationId,
        actionData.actionId,
        ctx.userState.accountId,
      );

      pendingActions.delete(shortId);

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

      const actionData = pendingActions.get(shortId);
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

      pendingActions.delete(shortId);

      const html = markdownToTelegramHtml(result.message);
      await ctx.editMessageText(html, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error(`Error rejecting action: ${error}`);
      await ctx.answerCbQuery('Failed to cancel.');
    }
  }
}
