import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppLinkService } from '../whatsapp-link.service';
import { WhatsAppClientService } from '../whatsapp-client.service';
import { PrismaService } from '../../../database/prisma.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { WhatsAppUserState } from '../types';
import { t } from '../helpers/i18n';

@Injectable()
export class CommandHandler {
  private readonly logger = new Logger(CommandHandler.name);

  constructor(
    private readonly linkService: WhatsAppLinkService,
    private readonly client: WhatsAppClientService,
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * `link <code>` — works before the user is linked (no userState available).
   * Falls back to English because we have no language hint yet.
   */
  async handleLink(waPhoneNumber: string, code: string, profileName?: string): Promise<void> {
    try {
      if (!code || code.trim().length === 0) {
        await this.client.sendText(waPhoneNumber, t('linkProvideCode', 'en'));
        return;
      }

      const result = await this.linkService.redeemCode(code.trim(), waPhoneNumber, profileName);

      if (result.success) {
        // Reload the link to get the user's language preference
        const link = await this.linkService.getLink(waPhoneNumber);
        const lang = link?.user?.language || 'en';
        await this.client.sendText(waPhoneNumber, t('linkSuccess', lang));
      } else {
        // User language unknown pre-link — reply in English
        await this.client.sendText(waPhoneNumber, `❌ ${result.error}`);
      }
    } catch (error) {
      this.logger.error(`Error in handleLink: ${error}`);
      await this.client.sendText(waPhoneNumber, t('somethingWrong', 'en'));
    }
  }

  async handleHelp(userState: WhatsAppUserState): Promise<void> {
    try {
      await this.client.sendText(userState.waPhoneNumber, t('helpText', userState.language));
    } catch (error) {
      this.logger.error(`Error in handleHelp: ${error}`);
      await this.client.sendText(userState.waPhoneNumber, t('somethingWrong', userState.language));
    }
  }

  async handleUnlink(userState: WhatsAppUserState): Promise<void> {
    try {
      const success = await this.linkService.unlinkByUserId(userState.userId);
      if (success) {
        await this.client.sendText(userState.waPhoneNumber, t('unlinkSuccess', userState.language));
      } else {
        await this.client.sendText(userState.waPhoneNumber, t('notLinked', userState.language));
      }
    } catch (error) {
      this.logger.error(`Error in handleUnlink: ${error}`);
      await this.client.sendText(userState.waPhoneNumber, t('somethingWrong', userState.language));
    }
  }

  async handleAccount(userState: WhatsAppUserState): Promise<void> {
    try {
      const memberships = await this.prisma.accountMember.findMany({
        where: { userId: userState.userId },
        include: { account: { select: { id: true, name: true, currencyCode: true } } },
      });

      const lang = userState.language;

      if (memberships.length === 0) {
        await this.client.sendText(userState.waPhoneNumber, t('notLinked', lang));
        return;
      }

      if (memberships.length === 1) {
        await this.client.sendText(
          userState.waPhoneNumber,
          t('oneAccount', lang, { name: memberships[0].account.name }),
        );
        return;
      }

      // 2+ accounts — show a list so the user can pick one
      const rows = memberships.map((m) => ({
        id: `account--${m.account.id}`,
        title: m.account.name,
        description: m.account.currencyCode,
      }));

      await this.client.sendList(
        userState.waPhoneNumber,
        t('chooseAccount', lang),
        'Choose',
        rows,
      );
    } catch (error) {
      this.logger.error(`Error in handleAccount: ${error}`);
      await this.client.sendText(userState.waPhoneNumber, t('somethingWrong', userState.language));
    }
  }

  async handleNewChat(userState: WhatsAppUserState): Promise<void> {
    try {
      await this.linkService.resetConversation(userState.waPhoneNumber);
      await this.client.sendText(userState.waPhoneNumber, t('newChatStarted', userState.language));
    } catch (error) {
      this.logger.error(`Error in handleNewChat: ${error}`);
      await this.client.sendText(userState.waPhoneNumber, t('somethingWrong', userState.language));
    }
  }

  async handleUsage(userState: WhatsAppUserState): Promise<void> {
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

      await this.client.sendText(userState.waPhoneNumber, message);
    } catch (error) {
      this.logger.error(`Error in handleUsage: ${error}`);
      await this.client.sendText(userState.waPhoneNumber, t('somethingWrong', userState.language));
    }
  }

  async handleAccountCallback(accountId: string, userState: WhatsAppUserState): Promise<void> {
    try {
      await this.linkService.updateDefaultAccount(userState.waPhoneNumber, accountId);

      const membership = await this.prisma.accountMember.findFirst({
        where: { userId: userState.userId, accountId },
        include: { account: { select: { name: true } } },
      });

      const name = membership?.account?.name ?? accountId;
      await this.client.sendText(
        userState.waPhoneNumber,
        t('activeAccount', userState.language, { name }),
      );
    } catch (error) {
      this.logger.error(`Error in handleAccountCallback: ${error}`);
      await this.client.sendText(userState.waPhoneNumber, t('somethingWrong', userState.language));
    }
  }
}
