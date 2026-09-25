import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ExpensesService } from '../../expenses/expenses.service';
import { WhatsAppClientService } from '../whatsapp-client.service';
import { WhatsAppLinkService } from '../whatsapp-link.service';
import { ChatActionRecorderService } from '../../ai/services/chat-action-recorder.service';
import { WhatsAppUserState } from '../types';
import { parseAmount } from '../helpers/parse-amount';
import { t } from '../helpers/i18n';
import { logFireAndForget } from '../../../common/utils/fire-and-forget';

@Injectable()
export class ExpenseHandler {
  private readonly logger = new Logger(ExpenseHandler.name);

  constructor(
    private readonly expensesService: ExpensesService,
    private readonly whatsappClient: WhatsAppClientService,
    private readonly chatActionRecorder: ChatActionRecorderService,
    private readonly linkService: WhatsAppLinkService,
  ) {}

  async handle(args: string, userState: WhatsAppUserState): Promise<void> {
    try {
      const lang = userState.language;

      if (userState.accountRole === 'viewer') {
        await this.whatsappClient.sendText(userState.waPhoneNumber, t('viewerRestricted', lang));
        return;
      }

      if (!args || !args.trim()) {
        await this.whatsappClient.sendText(
          userState.waPhoneNumber,
          'Usage: *expense <amount> [description]*\n\nExamples:\n  expense 50 lunch\n  expense 100 UAH taxi\n  expense €25 coffee',
        );
        return;
      }

      const parsed = parseAmount(args);
      if (!parsed) {
        await this.whatsappClient.sendText(
          userState.waPhoneNumber,
          '❌ Could not parse the amount. Please use: expense 50 description',
        );
        return;
      }

      const currencyCode = parsed.currencyCode || userState.currencyCode;
      const now = new Date();

      const { expense } = await this.expensesService.create(
        userState.accountId,
        userState.userId,
        {
          localId: randomUUID(),
          amount: parsed.amount,
          currencyCode,
          description: parsed.description || '',
          date: now.toISOString(),
          source: 'whatsapp',
        },
      );

      const categoryName =
        (expense as any)?.category?.name ? ` (${(expense as any).category.name})` : '';
      const amountStr = `${parsed.amount.toFixed(2)} ${currencyCode}`;
      const descPart = parsed.description ? ` — ${parsed.description}` : '';

      await this.whatsappClient.sendText(
        userState.waPhoneNumber,
        `${t('expenseCreated', lang)}: *${amountStr}*${descPart}${categoryName}`,
      );

      // Makes this write undoable via chat's "undo" (ABA-599) — a plain "expense"
      // command never touches ChatActionLifecycleService.confirmAction. Fire-and-forget:
      // must never affect the reply already sent above. Guarded on `expense` truthy —
      // defensive only, ExpensesService.create() always resolves one.
      if (expense) {
        const currentConversationId = userState.conversationId;
        void this.chatActionRecorder
          .recordExternalWrite({
            userId: userState.userId,
            accountId: userState.accountId,
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
              return this.linkService.updateConversationId(userState.waPhoneNumber, newConversationId);
            }
          })
          .catch(logFireAndForget(this.logger, 'ExpenseHandler.recordUndoable'));
      }
    } catch (error) {
      this.logger.error(`Error creating expense: ${error}`);
      await this.whatsappClient.sendText(
        userState.waPhoneNumber,
        t('somethingWrong', userState.language),
      );
    }
  }
}
