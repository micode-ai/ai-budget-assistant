import { Module } from '@nestjs/common';
import { PetsController } from './pets.controller';
import { PetsService } from './pets.service';
import { PetReminderCron } from './pet-reminder.cron';
import { PetCostRulesCron } from './pet-cost-rules.cron';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';

@Module({
  imports: [CurrencyExchangeModule],
  controllers: [PetsController],
  providers: [PetsService, PetReminderCron, PetCostRulesCron],
})
export class PetsModule {}
