import { Module } from '@nestjs/common';
import { DebtsController } from './debts.controller';
import { DebtsService } from './debts.service';
import { DebtReminderCron } from './debt-reminder.cron';

@Module({
  controllers: [DebtsController],
  providers: [DebtsService, DebtReminderCron],
})
export class DebtsModule {}
