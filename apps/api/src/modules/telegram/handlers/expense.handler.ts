import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ExpensesService } from '../../expenses/expenses.service';
import { BotContext } from '../types';
import { parseAmount } from '../helpers/parse-amount';
import { formatCurrency } from '../helpers/format-telegram';

export class ExpenseHandler {
  private readonly logger = new Logger(ExpenseHandler.name);

  constructor(private readonly expensesService: ExpensesService) {}

  async handle(ctx: BotContext): Promise<void> {
    try {
      if (!ctx.userState) {
        await ctx.reply('Please link your account first. Use /link <code>.');
        return;
      }

      const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
      const args = text.replace(/^\/expense\s*/i, '').trim();

      if (!args) {
        await ctx.reply(
          'Usage: <code>/expense &lt;amount&gt; [description]</code>\n\n' +
          'Examples:\n' +
          '  <code>/expense 50 lunch</code>\n' +
          '  <code>/expense 100 UAH taxi</code>\n' +
          '  <code>/expense €25 coffee</code>',
          { parse_mode: 'HTML' },
        );
        return;
      }

      const parsed = parseAmount(args);
      if (!parsed) {
        await ctx.reply('❌ Could not parse the amount. Please use: <code>/expense 50 description</code>', { parse_mode: 'HTML' });
        return;
      }

      const currencyCode = parsed.currencyCode || ctx.userState.currencyCode;
      const now = new Date();

      const { expense } = await this.expensesService.create(
        ctx.userState.accountId,
        ctx.userState.userId,
        {
          localId: randomUUID(),
          amount: parsed.amount,
          currencyCode,
          description: parsed.description || '',
          date: now.toISOString(),
          source: 'telegram',
        },
      );

      const categoryName = (expense as any)?.category?.name ? ` (${(expense as any).category.name})` : '';
      await ctx.reply(
        `✅ Expense added: <b>${formatCurrency(parsed.amount, currencyCode)}</b>${parsed.description ? ` — ${parsed.description}` : ''}${categoryName}`,
        { parse_mode: 'HTML' },
      );
    } catch (error) {
      this.logger.error(`Error creating expense: ${error}`);
      await ctx.reply('❌ Could not add expense. Please try again.');
    }
  }
}
