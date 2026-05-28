import { Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import { Prisma } from '@prisma/client';
import { CategoriesService } from '../../categories/categories.service';
import { BotContext } from '../types';
import { escapeHtml } from '../helpers/format-telegram';
import { t } from '../helpers/i18n';

export class CategoryHandler {
  private readonly logger = new Logger(CategoryHandler.name);

  constructor(private readonly categoriesService: CategoriesService) {}

  async handle(ctx: BotContext): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.reply('Please link your account first. Use /link <code>.');
        return;
      }

      const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
      const args = text.replace(/^\/category(@\w+)?\s*/, '').trim();

      if (!args) {
        await ctx.reply(
          '<b>Create a category:</b>\n\n' +
          '<code>/category expense Food</code>\n' +
          '<code>/category income Salary</code>\n' +
          '<code>/category Shopping</code> — will ask for type\n\n' +
          'Use /categories to see all categories.',
          { parse_mode: 'HTML' },
        );
        return;
      }

      if (ctx.userState.accountRole === 'viewer') {
        await ctx.reply(t('viewerRestricted', ctx.userState.language));
        return;
      }

      const parts = args.split(/\s+/);
      const firstWord = parts[0].toLowerCase();

      let type: string | null = null;
      let name: string;

      if (firstWord === 'expense' || firstWord === 'income') {
        type = firstWord;
        name = parts.slice(1).join(' ').trim();

        if (!name) {
          await ctx.reply('Please provide a category name.\n\nExample: <code>/category expense Food</code>', { parse_mode: 'HTML' });
          return;
        }
      } else {
        name = args;
      }

      if (name.length > 50) {
        await ctx.reply('Category name must be 50 characters or less.');
        return;
      }

      if (type) {
        await this.createCategory(ctx, type, name);
      } else {
        await ctx.reply(
          `Choose type for category "<b>${escapeHtml(name)}</b>":`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              Markup.button.callback('💰 Expense', `cat_e:${name}`),
              Markup.button.callback('📈 Income', `cat_i:${name}`),
            ]),
          },
        );
      }
    } catch (error) {
      this.logger.error(`Error in /category: ${error}`, error instanceof Error ? error.stack : undefined);
      await ctx.reply('Something went wrong. Please try again later.');
    }
  }

  async handleTypeCallback(ctx: BotContext, type: string, name: string): Promise<void> {
    try {
      if (!ctx.userState) return;

      await ctx.answerCbQuery();
      await this.createCategory(ctx, type, name, true);
    } catch (error) {
      this.logger.error(`Error in category type callback: ${error}`, error instanceof Error ? error.stack : undefined);
      await ctx.answerCbQuery('Something went wrong.');
    }
  }

  async handleList(ctx: BotContext): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.reply('Please link your account first. Use /link <code>.');
        return;
      }

      const categories = await this.categoriesService.findAll(ctx.userState.accountId);

      const expenseCategories = categories.filter((c) => c.type === 'expense');
      const incomeCategories = categories.filter((c) => c.type === 'income');

      let message = '<b>Categories</b>\n\n';

      if (expenseCategories.length > 0) {
        message += '💰 <b>Expense:</b>\n';
        for (const cat of expenseCategories) {
          const system = cat.isSystem ? ' <i>(system)</i>' : '';
          message += `  • ${escapeHtml(cat.name)}${system}\n`;
        }
        message += '\n';
      }

      if (incomeCategories.length > 0) {
        message += '📈 <b>Income:</b>\n';
        for (const cat of incomeCategories) {
          const system = cat.isSystem ? ' <i>(system)</i>' : '';
          message += `  • ${escapeHtml(cat.name)}${system}\n`;
        }
        message += '\n';
      }

      if (expenseCategories.length === 0 && incomeCategories.length === 0) {
        message += 'No categories found. Create one with /category';
      }

      // Build delete buttons for non-system categories
      const customCategories = categories.filter((c) => !c.isSystem);
      const buttons = customCategories.map((cat) => {
        const emoji = cat.type === 'expense' ? '💰' : '📈';
        return [Markup.button.callback(`❌ ${emoji} ${cat.name}`, `cat_d:${cat.id}`)];
      });

      if (buttons.length > 0) {
        message += '<i>Tap to delete:</i>';
        await ctx.reply(message, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard(buttons),
        });
      } else {
        await ctx.reply(message, { parse_mode: 'HTML' });
      }
    } catch (error) {
      this.logger.error(`Error in /categories: ${error}`, error instanceof Error ? error.stack : undefined);
      await ctx.reply('Something went wrong. Please try again later.');
    }
  }

  async handleDeleteCallback(ctx: BotContext, categoryId: string): Promise<void> {
    try {
      if (!ctx.userState) return;

      await this.categoriesService.remove(ctx.userState.accountId, categoryId);
      await ctx.answerCbQuery('Category deleted');

      // Refresh the list
      const categories = await this.categoriesService.findAll(ctx.userState.accountId);

      const expenseCategories = categories.filter((c) => c.type === 'expense');
      const incomeCategories = categories.filter((c) => c.type === 'income');

      let message = '<b>Categories</b>\n\n';

      if (expenseCategories.length > 0) {
        message += '💰 <b>Expense:</b>\n';
        for (const cat of expenseCategories) {
          const system = cat.isSystem ? ' <i>(system)</i>' : '';
          message += `  • ${escapeHtml(cat.name)}${system}\n`;
        }
        message += '\n';
      }

      if (incomeCategories.length > 0) {
        message += '📈 <b>Income:</b>\n';
        for (const cat of incomeCategories) {
          const system = cat.isSystem ? ' <i>(system)</i>' : '';
          message += `  • ${escapeHtml(cat.name)}${system}\n`;
        }
        message += '\n';
      }

      const customCategories = categories.filter((c) => !c.isSystem);
      const buttons = customCategories.map((cat) => {
        const emoji = cat.type === 'expense' ? '💰' : '📈';
        return [Markup.button.callback(`❌ ${emoji} ${cat.name}`, `cat_d:${cat.id}`)];
      });

      if (buttons.length > 0) {
        message += '<i>Tap to delete:</i>';
        await ctx.editMessageText(message, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard(buttons),
        });
      } else {
        await ctx.editMessageText(message, { parse_mode: 'HTML' });
      }
    } catch (error) {
      this.logger.error(`Error deleting category: ${error}`, error instanceof Error ? error.stack : undefined);
      await ctx.answerCbQuery('Failed to delete category.');
    }
  }

  private async createCategory(ctx: BotContext, type: string, name: string, editMessage = false): Promise<void> {
    try {
      const category = await this.categoriesService.create(
        ctx.userState!.accountId,
        ctx.userState!.userId,
        { name, type },
      );

      const emoji = type === 'expense' ? '💰' : '📈';
      const msg = `✅ Category created: ${emoji} <b>${escapeHtml(category.name)}</b> (${type})`;

      if (editMessage) {
        await ctx.editMessageText(msg, { parse_mode: 'HTML' });
      } else {
        await ctx.reply(msg, { parse_mode: 'HTML' });
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const msg = `❌ Category "<b>${escapeHtml(name)}</b>" already exists for ${type}.`;
        if (editMessage) {
          await ctx.editMessageText(msg, { parse_mode: 'HTML' });
        } else {
          await ctx.reply(msg, { parse_mode: 'HTML' });
        }
        return;
      }
      throw error;
    }
  }
}
