import { Global, Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramBotController } from './telegram-bot.controller';
import { TelegramLinkService } from './telegram-link.service';
import { AiModule } from '../ai/ai.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { IncomesModule } from '../incomes/incomes.module';
import { CategoriesModule } from '../categories/categories.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Global()
@Module({
  imports: [AiModule, ExpensesModule, IncomesModule, CategoriesModule, SubscriptionsModule],
  controllers: [TelegramBotController],
  providers: [TelegramService, TelegramBotService, TelegramLinkService],
  exports: [TelegramService, TelegramLinkService, TelegramBotService],
})
export class TelegramModule {}
