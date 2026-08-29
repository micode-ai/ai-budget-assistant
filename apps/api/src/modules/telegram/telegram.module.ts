import { Global, Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramBotController } from './telegram-bot.controller';
import { TelegramLinkService } from './telegram-link.service';
import { CommandHandler } from './handlers/command.handler';
import { ExpenseHandler } from './handlers/expense.handler';
import { IncomeHandler } from './handlers/income.handler';
import { ChatHandler } from './handlers/chat.handler';
import { VoiceHandler } from './handlers/voice.handler';
import { PhotoHandler } from './handlers/photo.handler';
import { CategoryHandler } from './handlers/category.handler';
import { PurchaseRequestHandler } from './handlers/purchase-request.handler';
import { AiModule } from '../ai/ai.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { IncomesModule } from '../incomes/incomes.module';
import { CategoriesModule } from '../categories/categories.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PurchaseRequestsModule } from '../purchase-requests/purchase-requests.module';

@Global()
@Module({
  imports: [AiModule, ExpensesModule, IncomesModule, CategoriesModule, SubscriptionsModule, PurchaseRequestsModule],
  controllers: [TelegramBotController],
  providers: [
    TelegramService,
    TelegramBotService,
    TelegramLinkService,
    CommandHandler,
    ExpenseHandler,
    IncomeHandler,
    ChatHandler,
    VoiceHandler,
    PhotoHandler,
    CategoryHandler,
    PurchaseRequestHandler,
  ],
  exports: [TelegramService, TelegramLinkService, TelegramBotService],
})
export class TelegramModule {}
