import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ExpensesService } from '../../expenses/expenses.service';
import { SlackClientService } from '../slack-client.service';
import { SlackUserState } from '../types';
import { parseAmount } from '../../whatsapp/helpers/parse-amount';
import { t } from '../helpers/i18n';

@Injectable()
export class ExpenseHandler {
  private readonly logger = new Logger(ExpenseHandler.name);

  constructor(
    private readonly expensesService: ExpensesService,
    private readonly slackClient: SlackClientService,
  ) {}

  async handle(args: string, userState: SlackUserState): Promise<void> {
    try {
      const lang = userState.language;

      if (userState.accountRole === 'viewer') {
        await this.slackClient.sendText(userState.channel, t('viewerRestricted', lang));
        return;
      }

      if (!args || !args.trim()) {
        await this.slackClient.sendText(
          userState.channel,
          'Usage: *expense <amount> [description]*\n\nExamples:\n  expense 50 lunch\n  expense 100 UAH taxi\n  expense €25 coffee',
        );
        return;
      }

      const parsed = parseAmount(args);
      if (!parsed) {
        await this.slackClient.sendText(
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
        userState.channel,
        `${t('expenseCreated', lang)}: *${amountStr}*${descPart}${categoryName}`,
      );
    } catch (error) {
      this.logger.error(`Error creating expense: ${error}`);
      await this.slackClient.sendText(
        userState.channel,
        t('somethingWrong', userState.language),
      );
    }
  }
}
