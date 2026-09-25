import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ExpensesService } from '../../expenses/expenses.service';
import { SlackClientService } from '../slack-client.service';
import { SlackLinkService } from '../slack-link.service';
import { ChatActionRecorderService } from '../../ai/services/chat-action-recorder.service';
import { SlackUserState } from '../types';
import { parseAmount } from '../../whatsapp/helpers/parse-amount';
import { t } from '../helpers/i18n';
import { logFireAndForget } from '../../../common/utils/fire-and-forget';

@Injectable()
export class ExpenseHandler {
  private readonly logger = new Logger(ExpenseHandler.name);

  constructor(
    private readonly expensesService: ExpensesService,
    private readonly slackClient: SlackClientService,
    private readonly chatActionRecorder: ChatActionRecorderService,
    private readonly linkService: SlackLinkService,
  ) {}

  async handle(args: string, userState: SlackUserState): Promise<void> {
    try {
      const lang = userState.language;
      const teamId = userState.slackTeamId;

      if (userState.accountRole === 'viewer') {
        await this.slackClient.sendText(teamId, userState.channel, t('viewerRestricted', lang));
        return;
      }

      if (!args || !args.trim()) {
        await this.slackClient.sendText(
          teamId,
          userState.channel,
          'Usage: *expense <amount> [description]*\n\nExamples:\n  expense 50 lunch\n  expense 100 UAH taxi\n  expense €25 coffee',
        );
        return;
      }

      const parsed = parseAmount(args);
      if (!parsed) {
        await this.slackClient.sendText(
          teamId,
          userState.channel,
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
          source: 'slack',
        },
      );

      const categoryName =
        (expense as any)?.category?.name ? ` (${(expense as any).category.name})` : '';
      const amountStr = `${parsed.amount.toFixed(2)} ${currencyCode}`;
      const descPart = parsed.description ? ` — ${parsed.description}` : '';

      await this.slackClient.sendText(
        teamId,
        userState.channel,
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
              return this.linkService.updateConversationId(userState.slackUserId, newConversationId);
            }
          })
          .catch(logFireAndForget(this.logger, 'ExpenseHandler.recordUndoable'));
      }
    } catch (error) {
      this.logger.error(`Error creating expense: ${error}`);
      await this.slackClient.sendText(
        userState.slackTeamId,
        userState.channel,
        t('somethingWrong', userState.language),
      );
    }
  }
}
