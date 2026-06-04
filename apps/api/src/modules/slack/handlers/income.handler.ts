import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IncomesService } from '../../incomes/incomes.service';
import { SlackClientService } from '../slack-client.service';
import { SlackUserState } from '../types';
import { parseAmount } from '../../whatsapp/helpers/parse-amount';
import { t } from '../helpers/i18n';

@Injectable()
export class IncomeHandler {
  private readonly logger = new Logger(IncomeHandler.name);

  constructor(
    private readonly incomesService: IncomesService,
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
          'Usage: *income <amount> [description]*\n\nExamples:\n  income 3000 salary\n  income 500 UAH freelance',
        );
        return;
      }

      const parsed = parseAmount(args);
      if (!parsed) {
        await this.slackClient.sendText(
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
        userState.channel,
        `${t('incomeCreated', lang)}: *${amountStr}*${descPart}${categoryName}`,
      );
    } catch (error) {
      this.logger.error(`Error creating income: ${error}`);
      await this.slackClient.sendText(
        userState.channel,
        t('somethingWrong', userState.language),
      );
    }
  }
}
