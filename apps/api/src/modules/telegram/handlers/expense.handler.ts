import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ExpensesService } from '../../expenses/expenses.service';
import { ChatActionRecorderService } from '../../ai/services/chat-action-recorder.service';
import { TelegramLinkService } from '../telegram-link.service';
import { BotContext } from '../types';
import { parseAmount } from '../helpers/parse-amount';
import { formatCurrency } from '../helpers/format-telegram';
import { t } from '../helpers/i18n';
import { logFireAndForget } from '../../../common/utils/fire-and-forget';

@Injectable()
export class ExpenseHandler {
  private readonly logger = new Logger(ExpenseHandler.name);

  constructor(
    private readonly expensesService: ExpensesService,
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

      // Makes this write undoable via chat's "undo" (ABA-599) — a /expense command
      // never touches ChatActionLifecycleService.confirmAction, so without this
      // recording, undo_last_action would never find it. Fire-and-forget: must
      // never affect the reply already sent above. Guarded on `expense` truthy —
      // defensive only, ExpensesService.create() always resolves one — so a
      // malformed/unexpected result skips recording rather than throwing here.
      if (expense) {
        const currentConversationId = ctx.userState.conversationId;
        const telegramUserId = ctx.userState.telegramUserId;
        void this.chatActionRecorder
          .recordExternalWrite({
            userId: ctx.userState.userId,
            accountId: ctx.userState.accountId,
            conversationId: currentConversationId,
            actionType: 'create_expense',
            resultData: {
              id: expense.id,
              amount: Number(expense.amount),
              currencyCode: expense.currencyCode,
              description: expense.description,
              category: (expense as any)?.category?.name,
              date: expense.date,
            },
          })
          .then((newConversationId) => {
            if (newConversationId !== currentConversationId) {
              return this.linkService.updateConversationId(telegramUserId, newConversationId);
            }
          })
          .catch(logFireAndForget(this.logger, 'ExpenseHandler.recordUndoable'));
      }
    } catch (error) {
      this.logger.error(`Error creating expense: ${error}`);
      await ctx.reply('❌ Could not add expense. Please try again.');
    }
  }
}
