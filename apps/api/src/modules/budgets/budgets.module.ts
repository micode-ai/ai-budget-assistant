import { Module } from '@nestjs/common';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { BudgetAlertService } from './budget-alert.service';

@Module({
  controllers: [BudgetsController],
  providers: [BudgetsService, BudgetAlertService],
  exports: [BudgetsService, BudgetAlertService],
})
export class BudgetsModule {}
