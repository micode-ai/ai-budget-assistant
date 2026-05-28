import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IncomesService } from '../../incomes/incomes.service';
import { WhatsAppClientService } from '../whatsapp-client.service';
import { WhatsAppUserState } from '../types';
import { parseAmount } from '../helpers/parse-amount';
import { t } from '../helpers/i18n';

@Injectable()
export class IncomeHandler {
  private readonly logger = new Logger(IncomeHandler.name);

  constructor(
    private readonly incomesService: IncomesService,
    private readonly whatsappClient: WhatsAppClientService,
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
          'Usage: *income <amount> [description]*\n\nExamples:\n  income 3000 salary\n  income 500 UAH freelance',
        );
        return;
      }

      const parsed = parseAmount(args);
      if (!parsed) {
        await this.whatsappClient.sendText(
          userState.waPhoneNumber,
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
        },
      );

      const categoryName =
        (income as any)?.category?.name ? ` (${(income as any).category.name})` : '';
      const amountStr = `${parsed.amount.toFixed(2)} ${currencyCode}`;
      const descPart = parsed.description ? ` — ${parsed.description}` : '';

      await this.whatsappClient.sendText(
        userState.waPhoneNumber,
        `${t('incomeCreated', lang)}: *${amountStr}*${descPart}${categoryName}`,
      );
    } catch (error) {
      this.logger.error(`Error creating income: ${error}`);
      await this.whatsappClient.sendText(
        userState.waPhoneNumber,
        t('somethingWrong', userState.language),
      );
    }
  }
}
