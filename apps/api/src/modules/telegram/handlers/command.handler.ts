import { Logger } from '@nestjs/common';
import { TelegramLinkService } from '../telegram-link.service';
import { PrismaService } from '../../../database/prisma.service';
import { BotContext } from '../types';
import { Markup } from 'telegraf';

export class CommandHandler {
  private readonly logger = new Logger(CommandHandler.name);

  constructor(
    private readonly linkService: TelegramLinkService,
    private readonly prisma: PrismaService,
  ) {}

  async handleStart(ctx: BotContext): Promise<void> {
    try {
      if (ctx.userState) {
        await ctx.reply(
          `Welcome back! You are linked to account <b>${(await this.getAccountName(ctx.userState.accountId))}</b>.\n\nSend /help to see available commands.`,
          { parse_mode: 'HTML' },
        );
      } else {
        await ctx.reply(
          '👋 Welcome to Budget Assistant Bot!\n\n' +
          'To get started, link your account:\n' +
          '1. Open the app → Settings → Telegram Bot\n' +
          '2. Tap "Connect Telegram"\n' +
          '3. Send the code here: /link YOUR_CODE\n\n' +
          'Example: <code>/link A3K9F2</code>',
          { parse_mode: 'HTML' },
        );
      }
    } catch (error) {
      this.logger.error(`Error in /start: ${error}`);
      await ctx.reply('Something went wrong. Please try again later.');
    }
  }

  async handleLink(ctx: BotContext): Promise<void> {
    try {
      const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
      const parts = text.split(/\s+/);
      const code = parts[1];

      if (!code) {
        await ctx.reply('Please provide a link code.\n\nUsage: <code>/link YOUR_CODE</code>', { parse_mode: 'HTML' });
        return;
      }

      const telegramUserId = String(ctx.from!.id);
      const telegramUsername = ctx.from!.username;

      const result = await this.linkService.redeemCode(code, telegramUserId, telegramUsername);

      if (result.success) {
        await ctx.reply(
          '✅ Account linked successfully!\n\n' +
          'You can now:\n' +
          '• Add expenses: <code>/expense 50 lunch</code>\n' +
          '• Add incomes: <code>/income 3000 salary</code>\n' +
          '• Send voice messages to add expenses/chat\n' +
          '• Send receipt photos to scan them\n' +
          '• Chat with AI — just type any question\n\n' +
          'Send /help for all commands.',
          { parse_mode: 'HTML' },
        );
      } else {
        await ctx.reply(`❌ ${result.error}`);
      }
    } catch (error) {
      this.logger.error(`Error in /link: ${error}`);
      await ctx.reply('Something went wrong. Please try again later.');
    }
  }

  async handleUnlink(ctx: BotContext): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.reply('Your Telegram is not linked to any account.');
        return;
      }

      const success = await this.linkService.unlinkByTelegramId(ctx.userState.telegramUserId);
      if (success) {
        await ctx.reply('✅ Your Telegram has been unlinked. Send /link <code> to connect again.');
      } else {
        await ctx.reply('No active link found.');
      }
    } catch (error) {
      this.logger.error(`Error in /unlink: ${error}`);
      await ctx.reply('Something went wrong. Please try again later.');
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

      if (memberships.length === 0) {
        await ctx.reply('No accounts found.');
        return;
      }

      if (memberships.length === 1) {
        await ctx.reply(`You have one account: <b>${memberships[0].account.name}</b> (already active).`, { parse_mode: 'HTML' });
        return;
      }

      const buttons = memberships.map((m) => {
        const active = m.account.id === ctx.userState!.accountId ? ' ✓' : '';
        return [Markup.button.callback(`${m.account.name} (${m.account.currencyCode})${active}`, `account:${m.account.id}`)];
      });

      await ctx.reply('Choose an account:', Markup.inlineKeyboard(buttons));
    } catch (error) {
      this.logger.error(`Error in /account: ${error}`);
      await ctx.reply('Something went wrong. Please try again later.');
    }
  }

  async handleAccountCallback(ctx: BotContext, accountId: string): Promise<void> {
    try {
      if (!ctx.userState) return;

      // Verify user has access to this account
      const membership = await this.prisma.accountMember.findFirst({
        where: { userId: ctx.userState.userId, accountId },
        include: { account: { select: { name: true } } },
      });

      if (!membership) {
        await ctx.answerCbQuery('Account not found.');
        return;
      }

      await this.linkService.updateDefaultAccount(ctx.userState.telegramUserId, accountId);
      await ctx.answerCbQuery(`Switched to ${membership.account.name}`);
      await ctx.editMessageText(`✅ Active account: <b>${membership.account.name}</b>`, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error(`Error in account callback: ${error}`);
      await ctx.answerCbQuery('Something went wrong.');
    }
  }

  async handleNewChat(ctx: BotContext): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.reply('Please link your account first. Use /link <code>.');
        return;
      }

      await this.linkService.resetConversation(ctx.userState.telegramUserId);
      await ctx.reply('🔄 New conversation started. Ask me anything!');
    } catch (error) {
      this.logger.error(`Error in /newchat: ${error}`);
      await ctx.reply('Something went wrong. Please try again later.');
    }
  }

  async handleHelp(ctx: BotContext): Promise<void> {
    try {
      await ctx.reply(
        '<b>Available commands:</b>\n\n' +
        '/expense &lt;amount&gt; [description] — Add an expense\n' +
        '  <i>Example: /expense 50 lunch</i>\n' +
        '  <i>Example: /expense 100 UAH taxi</i>\n\n' +
        '/income &lt;amount&gt; [description] — Add income\n' +
        '  <i>Example: /income 3000 salary</i>\n\n' +
        '/category [type] &lt;name&gt; — Create a category\n' +
        '  <i>Example: /category expense Food</i>\n' +
        '  <i>Example: /category income Salary</i>\n' +
        '/categories — List &amp; delete categories\n\n' +
        '/account — Switch between accounts\n' +
        '/newchat — Start a new AI conversation\n' +
        '/unlink — Disconnect Telegram from the app\n' +
        '/help — Show this message\n\n' +
        '<b>Other features:</b>\n' +
        '🎤 Send a <b>voice message</b> to add expenses or chat with AI\n' +
        '📷 Send a <b>receipt photo</b> to scan and create an expense\n' +
        '💬 Just type any message to <b>chat with the AI assistant</b>',
        { parse_mode: 'HTML' },
      );
    } catch (error) {
      this.logger.error(`Error in /help: ${error}`);
      await ctx.reply('Something went wrong. Please try again later.');
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
