import { Inject, Injectable, Logger, ForbiddenException } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { ChatService } from '../../ai/services/chat.service';
import { SlackLinkService } from '../slack-link.service';
import { PrismaService } from '../../../database/prisma.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { SlackClientService } from '../slack-client.service';
import { markdownToSlack } from '../helpers/format-slack';
import { resolveAccountFromMessage, AccountInfo } from '../../whatsapp/helpers/resolve-account';
import { t } from '../helpers/i18n';
import { SlackUserState, SLACK_REDIS } from '../types';

@Injectable()
export class ChatHandler {
  private readonly logger = new Logger(ChatHandler.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly linkService: SlackLinkService,
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly slackClient: SlackClientService,
    @Inject(SLACK_REDIS) private readonly redis: Redis,
  ) {}

  async handleText(text: string, userState: SlackUserState, placeholderTs?: string): Promise<void> {
    let ts = placeholderTs;
    try {
      const { userId, accountId, conversationId, channel, language } = userState;
      const teamId = userState.slackTeamId;

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

      // Post placeholder if caller did not already post one
      if (!ts) {
        ts = await this.slackClient.postPlaceholder(teamId, channel, t('thinking', language));
      }

      // Track AI usage (1.0 for chat)
      try {
        await this.subscriptionsService.trackAiUsage(userId, 'chat', 1.0, effectiveAccountId);
      } catch (e) {
        if (e instanceof ForbiddenException) {
          await this.slackClient.replyText(teamId, channel, ts, t('aiLimitReached', language));
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
        await this.linkService.updateConversationId(userState.slackUserId, response.conversationId);
      }

      // Handle pending action (write action needing confirmation)
      if (response.pendingAction) {
        const { id: actionId } = response.pendingAction;
        const shortId = randomUUID().slice(0, 8);
        await this.redis.set(
          `slack:pa:${shortId}`,
          JSON.stringify({ conversationId: response.conversationId, actionId }),
          'EX',
          1800,
        );
        await this.slackClient.replyButtons(teamId, channel, ts, markdownToSlack(response.message), [
          { id: `ca:${shortId}`, title: t('confirm', language) },
          { id: `ra:${shortId}`, title: t('cancel', language) },
        ]);
        return;
      }

      // Plain text or read action result
      await this.slackClient.replyText(teamId, channel, ts, markdownToSlack(response.message));
    } catch (error) {
      this.logger.error(`Error in ChatHandler.handleText: ${error}`);
      await this.slackClient.replyText(
        userState.slackTeamId,
        userState.channel,
        ts,
        t('somethingWrong', userState.language),
      );
    }
  }

  async handleConfirmCallback(shortId: string, userState: SlackUserState): Promise<void> {
    try {
      const { channel, language, userId, accountId } = userState;
      const teamId = userState.slackTeamId;

      const raw = await this.redis.get(`slack:pa:${shortId}`);
      if (!raw) {
        await this.slackClient.sendText(
          teamId,
          channel,
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
          await this.slackClient.sendText(teamId, channel, t('aiLimitReached', language));
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

      await this.redis.del(`slack:pa:${shortId}`);

      await this.slackClient.sendText(teamId, channel, markdownToSlack(result.message));
    } catch (error) {
      this.logger.error(`Error in ChatHandler.handleConfirmCallback: ${error}`);
      await this.slackClient.sendText(
        userState.slackTeamId,
        userState.channel,
        t('somethingWrong', userState.language),
      );
    }
  }

  async handleRejectCallback(shortId: string, userState: SlackUserState): Promise<void> {
    try {
      const { channel, language, userId } = userState;
      const teamId = userState.slackTeamId;

      const raw = await this.redis.get(`slack:pa:${shortId}`);
      if (!raw) {
        await this.slackClient.sendText(
          teamId,
          channel,
          `${t('cancelled', language)} Action expired.`,
        );
        return;
      }

      const { conversationId, actionId } = JSON.parse(raw) as {
        conversationId: string;
        actionId: string;
      };

      const result = await this.chatService.rejectAction(userId, conversationId, actionId);

      await this.redis.del(`slack:pa:${shortId}`);

      await this.slackClient.sendText(teamId, channel, markdownToSlack(result.message));
    } catch (error) {
      this.logger.error(`Error in ChatHandler.handleRejectCallback: ${error}`);
      await this.slackClient.sendText(
        userState.slackTeamId,
        userState.channel,
        t('somethingWrong', userState.language),
      );
    }
  }
}
