import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IncomesService } from '../../incomes/incomes.service';
import { ChatActionRecorderService } from '../../ai/services/chat-action-recorder.service';
import { TelegramLinkService } from '../telegram-link.service';
import { BotContext } from '../types';
import { parseAmount } from '../helpers/parse-amount';
import { formatCurrency } from '../helpers/format-telegram';
import { t } from '../helpers/i18n';
import { logFireAndForget } from '../../../common/utils/fire-and-forget';

@Injectable()
export class IncomeHandler {
  private readonly logger = new Logger(IncomeHandler.name);

  constructor(
    private readonly incomesService: IncomesService,
    private readonly chatActionRecorder: ChatActionRecorderService,
    private readonly linkService: TelegramLinkService,
  ) {}

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

      // Makes this write undoable via chat's "undo" (ABA-599) — see ExpenseHandler
      // for the full rationale. Fire-and-forget: must never affect the reply above.
      // Guarded on `income` truthy — defensive only, IncomesService.create() always
      // resolves one — so a malformed/unexpected result skips recording rather than
      // throwing here.
      if (income) {
        const currentConversationId = ctx.userState.conversationId;
        const telegramUserId = ctx.userState.telegramUserId;
        void this.chatActionRecorder
          .recordExternalWrite({
            userId: ctx.userState.userId,
            accountId: ctx.userState.accountId,
            conversationId: currentConversationId,
            actionType: 'create_income',
            resultData: {
              id: income.id,
              amount: Number(income.amount),
              currencyCode: income.currencyCode,
              description: income.description,
              category: (income as any)?.category?.name,
              date: income.date,
            },
          })
          .then((newConversationId) => {
            if (newConversationId !== currentConversationId) {
              return this.linkService.updateConversationId(telegramUserId, newConversationId);
            }
          })
          .catch(logFireAndForget(this.logger, 'IncomeHandler.recordUndoable'));
      }
    } catch (error) {
      this.logger.error(`Error creating income: ${error}`);
      await ctx.reply('❌ Could not add income. Please try again.');
    }
  }
}
