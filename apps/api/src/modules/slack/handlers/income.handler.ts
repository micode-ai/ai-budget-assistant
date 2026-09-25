import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IncomesService } from '../../incomes/incomes.service';
import { SlackClientService } from '../slack-client.service';
import { SlackLinkService } from '../slack-link.service';
import { ChatActionRecorderService } from '../../ai/services/chat-action-recorder.service';
import { SlackUserState } from '../types';
import { parseAmount } from '../../whatsapp/helpers/parse-amount';
import { t } from '../helpers/i18n';
import { logFireAndForget } from '../../../common/utils/fire-and-forget';

@Injectable()
export class IncomeHandler {
  private readonly logger = new Logger(IncomeHandler.name);

  constructor(
    private readonly incomesService: IncomesService,
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
          'Usage: *income <amount> [description]*\n\nExamples:\n  income 3000 salary\n  income 500 UAH freelance',
        );
        return;
      }

      const parsed = parseAmount(args);
      if (!parsed) {
        await this.slackClient.sendText(
          teamId,
          userState.channel,
          '❌ Could not parse the amount. Please use: income 3000 description',
        );
        return;
      }

      const currencyCode = parsed.currencyCode || userState.currencyCode;
      const now = new Date();

      const income = await this.incomesService.create(
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
        (income as any)?.category?.name ? ` (${(income as any).category.name})` : '';
      const amountStr = `${parsed.amount.toFixed(2)} ${currencyCode}`;
      const descPart = parsed.description ? ` — ${parsed.description}` : '';

      await this.slackClient.sendText(
        teamId,
        userState.channel,
        `${t('incomeCreated', lang)}: *${amountStr}*${descPart}${categoryName}`,
      );

      // Makes this write undoable via chat's "undo" (ABA-599) — see ExpenseHandler
      // for the full rationale. Fire-and-forget: must never affect the reply above.
      // Guarded on `income` truthy — defensive only, IncomesService.create() always
      // resolves one.
      if (income) {
        const currentConversationId = userState.conversationId;
        void this.chatActionRecorder
          .recordExternalWrite({
            userId: userState.userId,
            accountId: userState.accountId,
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
              return this.linkService.updateConversationId(userState.slackUserId, newConversationId);
            }
          })
          .catch(logFireAndForget(this.logger, 'IncomeHandler.recordUndoable'));
      }
    } catch (error) {
      this.logger.error(`Error creating income: ${error}`);
      await this.slackClient.sendText(
        userState.slackTeamId,
        userState.channel,
        t('somethingWrong', userState.language),
      );
    }
  }
}
