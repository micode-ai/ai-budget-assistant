import { Injectable, Logger } from '@nestjs/common';
import { SlackLinkService } from '../slack-link.service';
import { SlackClientService } from '../slack-client.service';
import { PrismaService } from '../../../database/prisma.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { SlackUserState } from '../types';
import { t } from '../helpers/i18n';

@Injectable()
export class CommandHandler {
  private readonly logger = new Logger(CommandHandler.name);

  constructor(
    private readonly linkService: SlackLinkService,
    private readonly slackClient: SlackClientService,
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * `link <code>` — works before the user is linked (no userState available).
   * Falls back to English because we have no language hint yet.
   * Uses the slackTeamId PARAMETER (not userState.slackTeamId — there is no userState here).
   */
  async handleLink(
    slackUserId: string,
    slackTeamId: string,
    code: string,
    channel: string,
    profileName?: string,
  ): Promise<void> {
    try {
      if (!code || code.trim().length === 0) {
        await this.slackClient.sendText(slackTeamId, channel, t('linkProvideCode', 'en'));
        return;
      }

      const result = await this.linkService.redeemCode(code.trim(), slackUserId, slackTeamId, profileName);

      if (result.success) {
        // Reload the link to get the user's language preference
        const link = await this.linkService.getLink(slackUserId);
        const lang = link?.user?.language || 'en';
        await this.slackClient.sendText(slackTeamId, channel, t('linkSuccess', lang));
      } else {
        // User language unknown pre-link — reply in English
        await this.slackClient.sendText(slackTeamId, channel, `❌ ${result.error}`);
      }
    } catch (error) {
      this.logger.error(`Error in handleLink: ${error}`);
      await this.slackClient.sendText(slackTeamId, channel, t('somethingWrong', 'en'));
    }
  }

  async handleHelp(userState: SlackUserState): Promise<void> {
    try {
      await this.slackClient.sendText(userState.slackTeamId, userState.channel, t('helpText', userState.language));
    } catch (error) {
      this.logger.error(`Error in handleHelp: ${error}`);
      await this.slackClient.sendText(userState.slackTeamId, userState.channel, t('somethingWrong', userState.language));
    }
  }

  async handleUnlink(userState: SlackUserState): Promise<void> {
    try {
      const success = await this.linkService.unlinkByUserId(userState.userId);
      if (success) {
        await this.slackClient.sendText(userState.slackTeamId, userState.channel, t('unlinkSuccess', userState.language));
      } else {
        await this.slackClient.sendText(userState.slackTeamId, userState.channel, t('notLinked', userState.language));
      }
    } catch (error) {
      this.logger.error(`Error in handleUnlink: ${error}`);
      await this.slackClient.sendText(userState.slackTeamId, userState.channel, t('somethingWrong', userState.language));
    }
  }

  async handleAccount(userState: SlackUserState): Promise<void> {
    try {
      const memberships = await this.prisma.accountMember.findMany({
        where: { userId: userState.userId },
        include: { account: { select: { id: true, name: true, currencyCode: true } } },
      });

      const lang = userState.language;
      const teamId = userState.slackTeamId;

      if (memberships.length === 0) {
        await this.slackClient.sendText(teamId, userState.channel, t('notLinked', lang));
        return;
      }

      if (memberships.length === 1) {
        await this.slackClient.sendText(
          teamId,
          userState.channel,
          t('oneAccount', lang, { name: memberships[0].account.name }),
        );
        return;
      }

      // 2+ accounts — show buttons so the user can pick one.
      // Slack actions blocks allow at most 25 elements; cap at 23 and list
      // the remainder as a plain-text note so we never exceed the limit.
      const shown = memberships.slice(0, 23);
      const overflow = memberships.slice(23);

      await this.slackClient.sendButtons(
        teamId,
        userState.channel,
        t('chooseAccount', lang),
        shown.map((m) => ({
          id: `account:${m.account.id}`,
          title: m.account.name,
        })),
      );

      if (overflow.length > 0) {
        const overflowNames = overflow.map((m) => m.account.name).join(', ');
        await this.slackClient.sendText(
          teamId,
          userState.channel,
          `_Also: ${overflowNames}_`,
        );
      }
    } catch (error) {
      this.logger.error(`Error in handleAccount: ${error}`);
      await this.slackClient.sendText(userState.slackTeamId, userState.channel, t('somethingWrong', userState.language));
    }
  }

  async handleNewChat(userState: SlackUserState): Promise<void> {
    try {
      await this.linkService.resetConversation(userState.slackUserId);
      await this.slackClient.sendText(userState.slackTeamId, userState.channel, t('newChatStarted', userState.language));
    } catch (error) {
      this.logger.error(`Error in handleNewChat: ${error}`);
      await this.slackClient.sendText(userState.slackTeamId, userState.channel, t('somethingWrong', userState.language));
    }
  }

  async handleUsage(userState: SlackUserState): Promise<void> {
    try {
      const stats = await this.subscriptionsService.getUsageStats(userState.userId);
      const now = new Date();
      const details = await this.subscriptionsService.getUsageDetails(
        userState.userId,
        now.getMonth() + 1,
        now.getFullYear(),
      );

      const lang = userState.language;
      const limitStr = stats.aiRequestsLimit === -1 ? '∞' : String(stats.aiRequestsLimit);

      let message = `${t('usageTitle', lang)}\n\n`;
      message += `*${t('used', lang)}:* ${stats.aiRequestsUsed} / ${limitStr}\n`;
      message += `*${t('tier', lang)}:* ${stats.tier}\n`;

      if (details.summary.length > 0) {
        message += `\n*${t('breakdown', lang)}:*\n`;
        for (const item of details.summary) {
          message += `  • ${item.feature}: ${item.count}× (${item.totalCost} credits)\n`;
        }
      }

      if (stats.resetAt) {
        const resetDate = new Date(stats.resetAt);
        message += `\n_${t('resets', lang)}: ${resetDate.toLocaleDateString()}_`;
      }

      await this.slackClient.sendText(userState.slackTeamId, userState.channel, message);
    } catch (error) {
      this.logger.error(`Error in handleUsage: ${error}`);
      await this.slackClient.sendText(userState.slackTeamId, userState.channel, t('somethingWrong', userState.language));
    }
  }

  async handleAccountCallback(accountId: string, userState: SlackUserState): Promise<void> {
    try {
      await this.linkService.updateDefaultAccount(userState.slackUserId, accountId);

      const membership = await this.prisma.accountMember.findFirst({
        where: { userId: userState.userId, accountId },
        include: { account: { select: { name: true } } },
      });

      const name = membership?.account?.name ?? accountId;
      await this.slackClient.sendText(
        userState.slackTeamId,
        userState.channel,
        t('activeAccount', userState.language, { name }),
      );
    } catch (error) {
      this.logger.error(`Error in handleAccountCallback: ${error}`);
      await this.slackClient.sendText(userState.slackTeamId, userState.channel, t('somethingWrong', userState.language));
    }
  }
}
