import { Injectable, Logger } from '@nestjs/common';
import { TelegramLinkService } from '../telegram-link.service';
import { PrismaService } from '../../../database/prisma.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { VoiceDigestService, DigestOutcome } from '../../voice-digest/voice-digest.service';
import { CacheService } from '../../../common/cache/cache.service';
import { logFireAndForget } from '../../../common/utils/fire-and-forget';
import { BotContext } from '../types';
import { Markup } from 'telegraf';
import { t } from '../helpers/i18n';

const DIGEST_NOW_TTL_SEC = 86400;
const DIGEST_NOW_UNAVAILABLE_OUTCOMES: DigestOutcome[] = ['unavailable', 'no_channel', 'failed', 'encrypted'];

@Injectable()
export class CommandHandler {
  private readonly logger = new Logger(CommandHandler.name);

  constructor(
    private readonly linkService: TelegramLinkService,
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly voiceDigestService: VoiceDigestService,
    private readonly cache: CacheService,
  ) {}

  async handleStart(ctx: BotContext): Promise<void> {
    try {
      const lang = ctx.userState?.language;
      if (ctx.userState) {
        const accountName = await this.getAccountName(ctx.userState.accountId);
        await ctx.reply(t('welcomeBack', lang, { account: accountName }), { parse_mode: 'HTML' });
      } else {
        await ctx.reply(t('welcomeNew', lang), { parse_mode: 'HTML' });
      }
    } catch (error) {
      this.logger.error(`Error in /start: ${error}`);
      await ctx.reply(t('somethingWrong', ctx.userState?.language));
    }
  }

  async handleLink(ctx: BotContext): Promise<void> {
    try {
      const lang = ctx.userState?.language;
      const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
      const parts = text.split(/\s+/);
      const code = parts[1];

      if (!code) {
        await ctx.reply(t('linkProvideCode', lang), { parse_mode: 'HTML' });
        return;
      }

      const telegramUserId = String(ctx.from!.id);
      const telegramUsername = ctx.from!.username;

      const result = await this.linkService.redeemCode(code, telegramUserId, telegramUsername);

      if (result.success) {
        // After linking, reload user state to get language
        const link = await this.prisma.telegramLink.findUnique({
          where: { telegramUserId, isActive: true },
          include: { user: { select: { language: true } } },
        });
        const userLang = link?.user?.language || lang;
        const message = `${t('linkSuccess', userLang)}\n\n${t('digestOffer', userLang, { command: '/digest on' })}`;
        await ctx.reply(message, { parse_mode: 'HTML' });
      } else {
        await ctx.reply(`❌ ${result.error}`);
      }
    } catch (error) {
      this.logger.error(`Error in /link: ${error}`);
      await ctx.reply(t('somethingWrong', ctx.userState?.language));
    }
  }

  async handleUnlink(ctx: BotContext): Promise<void> {
    try {
      const lang = ctx.userState?.language;
      if (!ctx.userState) {
        await ctx.reply(t('notLinked', lang));
        return;
      }

      const success = await this.linkService.unlinkByTelegramId(ctx.userState.telegramUserId);
      if (success) {
        await ctx.reply(t('unlinkSuccess', lang), { parse_mode: 'HTML' });
      } else {
        await ctx.reply(t('notLinked', lang));
      }
    } catch (error) {
      this.logger.error(`Error in /unlink: ${error}`);
      await ctx.reply(t('somethingWrong', ctx.userState?.language));
    }
  }

  async handleAccount(ctx: BotContext): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.reply('Please link your account first. Use /link <code>.');
        return;
      }

      const memberships = await this.prisma.accountMember.findMany({
        where: { userId: ctx.userState.userId },
        include: { account: { select: { id: true, name: true, currencyCode: true } } },
      });

      const lang = ctx.userState?.language;
      if (memberships.length === 0) {
        await ctx.reply(t('notLinked', lang));
        return;
      }

      if (memberships.length === 1) {
        await ctx.reply(t('oneAccount', lang, { name: memberships[0].account.name }), { parse_mode: 'HTML' });
        return;
      }

      const buttons = memberships.map((m) => {
        const active = m.account.id === ctx.userState!.accountId ? ' ✓' : '';
        return [Markup.button.callback(`${m.account.name} (${m.account.currencyCode})${active}`, `account:${m.account.id}`)];
      });

      await ctx.reply(t('chooseAccount', lang), Markup.inlineKeyboard(buttons));
    } catch (error) {
      this.logger.error(`Error in /account: ${error}`);
      await ctx.reply(t('somethingWrong', ctx.userState?.language));
    }
  }

  async handleAccountCallback(ctx: BotContext, accountId: string): Promise<void> {
    try {
      if (!ctx.userState) return;

      const membership = await this.prisma.accountMember.findFirst({
        where: { userId: ctx.userState.userId, accountId },
        include: { account: { select: { name: true } } },
      });

      if (!membership) {
        await ctx.answerCbQuery(t('somethingWrong', ctx.userState.language));
        return;
      }

      await this.linkService.updateDefaultAccount(ctx.userState.telegramUserId, accountId);
      await ctx.answerCbQuery(membership.account.name);
      await ctx.editMessageText(t('activeAccount', ctx.userState.language, { name: membership.account.name }), { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error(`Error in account callback: ${error}`);
      await ctx.answerCbQuery(t('somethingWrong', ctx.userState?.language));
    }
  }

  async handleNewChat(ctx: BotContext): Promise<void> {
    try {
      const lang = ctx.userState?.language;
      if (!ctx.userState) {
        await ctx.reply(t('linkFirst', lang), { parse_mode: 'HTML' });
        return;
      }

      await this.linkService.resetConversation(ctx.userState.telegramUserId);
      await ctx.reply(t('newChatStarted', lang));
    } catch (error) {
      this.logger.error(`Error in /newchat: ${error}`);
      await ctx.reply(t('somethingWrong', ctx.userState?.language));
    }
  }

  async handleUsage(ctx: BotContext): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.reply(t('linkFirst', ctx.from?.language_code), { parse_mode: 'HTML' });
        return;
      }

      const stats = await this.subscriptionsService.getUsageStats(ctx.userState.userId);
      const now = new Date();
      const details = await this.subscriptionsService.getUsageDetails(ctx.userState.userId, now.getMonth() + 1, now.getFullYear());

      const lang = ctx.userState.language;
      const limitStr = stats.aiRequestsLimit === -1 ? '∞' : String(stats.aiRequestsLimit);
      let message = `${t('usageTitle', lang)}\n\n`;
      message += `<b>${t('used', lang)}:</b> ${stats.aiRequestsUsed} / ${limitStr}\n`;
      message += `<b>${t('tier', lang)}:</b> ${stats.tier}\n`;

      if (details.summary.length > 0) {
        message += `\n<b>${t('breakdown', lang)}:</b>\n`;
        for (const item of details.summary) {
          message += `  • ${item.feature}: ${item.count}× (${item.totalCost} credits)\n`;
        }
      }

      if (stats.resetAt) {
        const resetDate = new Date(stats.resetAt);
        message += `\n<i>${t('resets', lang)}: ${resetDate.toLocaleDateString()}</i>`;
      }

      await ctx.reply(message, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error(`Error in /usage: ${error}`);
      await ctx.reply(t('somethingWrong', ctx.userState?.language));
    }
  }

  /**
   * `/digest on|off|now` — the weekly voice digest (ABA voice-digest Task 10).
   * Viewer role is allowed (read-only, no account-scoped write). `now` is
   * throttled to once per 24h via `CacheService.setIfAbsent` and runs in the
   * background after the `digestPreparing` acknowledgement — it must never
   * block the webhook handler.
   */
  async handleDigest(ctx: BotContext): Promise<void> {
    try {
      const lang = ctx.userState?.language;
      if (!ctx.userState) {
        await ctx.reply(t('linkFirst', lang), { parse_mode: 'HTML' });
        return;
      }

      const userId = ctx.userState.userId;
      const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
      const sub = text.split(/\s+/)[1]?.toLowerCase() ?? '';

      if (sub === 'on') {
        await this.voiceDigestService.enableFrom(userId, 'telegram');
        const settings = await this.voiceDigestService.getSettings(userId);
        const day = t(`weekday${settings.day}`, lang);
        const hour = `${String(settings.hour).padStart(2, '0')}:00`;
        await ctx.reply(t('digestOn', lang, { day, hour }), { parse_mode: 'HTML' });
        return;
      }

      if (sub === 'off') {
        await this.voiceDigestService.disable(userId);
        await ctx.reply(t('digestOff', lang), { parse_mode: 'HTML' });
        return;
      }

      if (sub === 'now') {
        const taken = await this.cache.setIfAbsent(`vd:now:${userId}`, DIGEST_NOW_TTL_SEC);
        if (!taken) {
          await ctx.reply(t('digestNowLimit', lang), { parse_mode: 'HTML' });
          return;
        }

        await ctx.reply(t('digestPreparing', lang), { parse_mode: 'HTML' });

        // Fire-and-forget: the caller (webhook handler) must not wait on this.
        this.voiceDigestService
          .runForUser(userId, { force: true, channel: 'telegram', preview: true })
          .then(async (outcome) => {
            if (outcome === 'empty') {
              await ctx.reply(t('digestEmpty', lang), { parse_mode: 'HTML' });
            } else if (DIGEST_NOW_UNAVAILABLE_OUTCOMES.includes(outcome)) {
              await ctx.reply(t('digestUnavailable', lang), { parse_mode: 'HTML' });
            }
            // 'sent' | 'template' | 'blocked' — no extra reply.
          })
          .catch(logFireAndForget(this.logger, 'CommandHandler.handleDigest'));
        return;
      }
    } catch (error) {
      this.logger.error(`Error in /digest: ${error}`);
      await ctx.reply(t('somethingWrong', ctx.userState?.language));
    }
  }

  async handleHelp(ctx: BotContext): Promise<void> {
    try {
      await ctx.reply(
        t('helpText', ctx.userState?.language),
        { parse_mode: 'HTML' },
      );
    } catch (error) {
      this.logger.error(`Error in /help: ${error}`);
      await ctx.reply(t('somethingWrong', ctx.userState?.language));
    }
  }

  private async getAccountName(accountId: string): Promise<string> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { name: true },
    });
    return account?.name || 'Unknown';
  }
}
