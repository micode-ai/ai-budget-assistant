import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ExpensesService } from '../../expenses/expenses.service';
import { WhatsAppClientService } from '../whatsapp-client.service';
import { WhatsAppUserState } from '../types';
import { parseAmount } from '../helpers/parse-amount';
import { t } from '../helpers/i18n';

@Injectable()
export class ExpenseHandler {
  private readonly logger = new Logger(ExpenseHandler.name);

  constructor(
    private readonly expensesService: ExpensesService,
    private readonly whatsappClient: WhatsAppClientService,
  ) {}

  async handle(args: string, userState: WhatsAppUserState): Promise<void> {
    try {
      const lang = userState.language;

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
    } catch (error) {
      this.logger.error(`Error creating expense: ${error}`);
      await this.whatsappClient.sendText(
        userState.waPhoneNumber,
        t('somethingWrong', userState.language),
      );
    }
  }
}
