import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { WhatsAppLinkService } from './whatsapp-link.service';
import { WhatsAppClientService } from './whatsapp-client.service';
import { WhatsAppBotService } from './whatsapp-bot.service';
import { AiModule } from '../ai/ai.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { IncomesModule } from '../incomes/incomes.module';
import { CategoriesModule } from '../categories/categories.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { WA_REDIS } from './types';

@Global()
@Module({
  imports: [AiModule, ExpensesModule, IncomesModule, CategoriesModule, SubscriptionsModule],
  providers: [
    WhatsAppLinkService,
    WhatsAppClientService,
    WhatsAppBotService,
    {
      provide: WA_REDIS,
      useFactory: (config: ConfigService) =>
        new Redis(config.get<string>('REDIS_URL') || 'redis://localhost:6379'),
      inject: [ConfigService],
    },
  ],
  exports: [WhatsAppLinkService, WhatsAppClientService, WhatsAppBotService, WA_REDIS],
})
export class WhatsAppModule {}
