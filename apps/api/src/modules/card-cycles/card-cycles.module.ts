import { Module } from '@nestjs/common';
import { CardCyclesController } from './card-cycles.controller';
import { CardCyclesService } from './card-cycles.service';
import { CardCycleReminderCron } from './card-cycle-reminder.cron';

@Module({
  controllers: [CardCyclesController],
  providers: [CardCyclesService, CardCycleReminderCron],
  exports: [CardCyclesService],
})
export class CardCyclesModule {}
