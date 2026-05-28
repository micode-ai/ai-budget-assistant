import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IncomesService } from '../../incomes/incomes.service';
import { BotContext } from '../types';
import { parseAmount } from '../helpers/parse-amount';
import { formatCurrency } from '../helpers/format-telegram';
import { t } from '../helpers/i18n';

export class IncomeHandler {
  private readonly logger = new Logger(IncomeHandler.name);

  constructor(private readonly incomesService: IncomesService) {}

  async handle(ctx: BotContext): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.reply('Please link your account first. Use /link <code>.');
        return;
      }

      if (ctx.userState.accountRole === 'viewer') {
        await ctx.reply(t('viewerRestricted', ctx.userState.language));
        return;
      }

      const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
      const args = text.replace(/^\/income\s*/i, '').trim();

      if (!args) {
        await ctx.reply(
          'Usage: <code>/income &lt;amount&gt; [description]</code>\n\n' +
          'Examples:\n' +
          '  <code>/income 3000 salary</code>\n' +
          '  <code>/income 500 UAH freelance</code>',
          { parse_mode: 'HTML' },
        );
        return;
      }

      const parsed = parseAmount(args);
      if (!parsed) {
        await ctx.reply('❌ Could not parse the amount. Please use: <code>/income 3000 description</code>', { parse_mode: 'HTML' });
        return;
      }

      const currencyCode = parsed.currencyCode || ctx.userState.currencyCode;
      const now = new Date();

      const income = await this.incomesService.create(
        ctx.userState.accountId,
        ctx.userState.userId,
        {
          localId: randomUUID(),
          amount: parsed.amount,
          currencyCode,
          description: parsed.description || '',
          date: now.toISOString(),
        },
      );

      const categoryName = (income as any)?.category?.name ? ` (${(income as any).category.name})` : '';
      await ctx.reply(
        `✅ Income added: <b>${formatCurrency(parsed.amount, currencyCode)}</b>${parsed.description ? ` — ${parsed.description}` : ''}${categoryName}`,
        { parse_mode: 'HTML' },
      );
    } catch (error) {
      this.logger.error(`Error creating income: ${error}`);
      await ctx.reply('❌ Could not add income. Please try again.');
    }
  }
}
