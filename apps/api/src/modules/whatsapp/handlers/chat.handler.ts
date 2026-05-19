import { Inject, Injectable, Logger, ForbiddenException } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { ChatService } from '../../ai/services/chat.service';
import { WhatsAppLinkService } from '../whatsapp-link.service';
import { PrismaService } from '../../../database/prisma.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { WhatsAppClientService } from '../whatsapp-client.service';
import { markdownToWhatsApp } from '../helpers/format-whatsapp';
import { resolveAccountFromMessage, AccountInfo } from '../helpers/resolve-account';
import { t } from '../helpers/i18n';
import { WhatsAppUserState, WA_REDIS } from '../types';

@Injectable()
export class ChatHandler {
  private readonly logger = new Logger(ChatHandler.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly linkService: WhatsAppLinkService,
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly whatsAppClient: WhatsAppClientService,
    @Inject(WA_REDIS) private readonly redis: Redis,
  ) {}

  async handleText(text: string, userState: WhatsAppUserState): Promise<void> {
    try {
      const { userId, accountId, conversationId, waPhoneNumber, language } = userState;

      // Resolve effective account from message text (e.g., "в счёте Family")
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
        const resolved = resolveAccountFromMessage(text, accounts, accountId);
        effectiveAccountId = resolved.resolvedAccountId;
        effectiveAccountName = resolved.resolvedAccountName;
      }

      // Track AI usage (1.0 for chat)
      try {
        await this.subscriptionsService.trackAiUsage(userId, 'chat', 1.0, effectiveAccountId);
      } catch (e) {
        if (e instanceof ForbiddenException) {
          await this.whatsAppClient.sendText(waPhoneNumber, t('aiLimitReached', language));
          return;
        }
        throw e;
      }

      const response = (await this.chatService.chat(
        userId,
        text,
        conversationId || undefined,
        effectiveAccountId,
        effectiveAccountName,
      )) as {
        message: string;
        conversationId: string;
        pendingAction?: { id: string; displaySummary: string };
        actionResult?: unknown;
      };

      // Persist conversation ID for continuity
      if (response.conversationId && response.conversationId !== conversationId) {
        await this.linkService.updateConversationId(waPhoneNumber, response.conversationId);
      }

      // Handle pending action (write action needing confirmation)
      if (response.pendingAction) {
        const { id: actionId } = response.pendingAction;

        const shortId = randomUUID().slice(0, 8);
        await this.redis.set(
          `wa:pa:${shortId}`,
          JSON.stringify({ conversationId: response.conversationId, actionId }),
          'EX',
          1800,
        );

        await this.whatsAppClient.sendButtons(
          waPhoneNumber,
          markdownToWhatsApp(response.message),
          [
            { id: `ca--${shortId}`, title: t('confirm', language) },
            { id: `ra--${shortId}`, title: t('cancel', language) },
          ],
        );
        return;
      }

      // Plain text or read action result
      await this.whatsAppClient.sendText(waPhoneNumber, markdownToWhatsApp(response.message));
    } catch (error) {
      this.logger.error(`Error in ChatHandler.handleText: ${error}`);
      await this.whatsAppClient.sendText(
        userState.waPhoneNumber,
        t('somethingWrong', userState.language),
      );
    }
  }

  async handleConfirmCallback(shortId: string, userState: WhatsAppUserState): Promise<void> {
    try {
      const { waPhoneNumber, language, userId, accountId } = userState;

      const raw = await this.redis.get(`wa:pa:${shortId}`);
      if (!raw) {
        await this.whatsAppClient.sendText(
          waPhoneNumber,
          `${t('cancelled', language)} Action expired.`,
        );
        return;
      }

      const { conversationId, actionId } = JSON.parse(raw) as {
        conversationId: string;
        actionId: string;
      };

      // Track AI usage for confirmation (0.5)
      try {
        await this.subscriptionsService.trackAiUsage(userId, 'chat', 0.5, accountId);
      } catch (e) {
        if (e instanceof ForbiddenException) {
          await this.whatsAppClient.sendText(waPhoneNumber, t('aiLimitReached', language));
          return;
        }
        throw e;
      }

      const result = await this.chatService.confirmAction(
        userId,
        conversationId,
        actionId,
        accountId,
      );

      await this.redis.del(`wa:pa:${shortId}`);

      await this.whatsAppClient.sendText(waPhoneNumber, markdownToWhatsApp(result.message));
    } catch (error) {
      this.logger.error(`Error in ChatHandler.handleConfirmCallback: ${error}`);
      await this.whatsAppClient.sendText(
        userState.waPhoneNumber,
        t('somethingWrong', userState.language),
      );
    }
  }

  async handleRejectCallback(shortId: string, userState: WhatsAppUserState): Promise<void> {
    try {
      const { waPhoneNumber, language, userId } = userState;

      const raw = await this.redis.get(`wa:pa:${shortId}`);
      if (!raw) {
        await this.whatsAppClient.sendText(
          waPhoneNumber,
          `${t('cancelled', language)} Action expired.`,
        );
        return;
      }

      const { conversationId, actionId } = JSON.parse(raw) as {
        conversationId: string;
        actionId: string;
      };

      const result = await this.chatService.rejectAction(userId, conversationId, actionId);

      await this.redis.del(`wa:pa:${shortId}`);

      await this.whatsAppClient.sendText(waPhoneNumber, markdownToWhatsApp(result.message));
    } catch (error) {
      this.logger.error(`Error in ChatHandler.handleRejectCallback: ${error}`);
      await this.whatsAppClient.sendText(
        userState.waPhoneNumber,
        t('somethingWrong', userState.language),
      );
    }
  }
}
