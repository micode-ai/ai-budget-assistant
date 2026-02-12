import { Module } from '@nestjs/common';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { BudgetAlertService } from './budget-alert.service';
import { GamificationModule } from '../gamification/gamification.module';

@Module({
  imports: [GamificationModule],
  controllers: [BudgetsController],
  providers: [BudgetsService, BudgetAlertService],
  exports: [BudgetsService, BudgetAlertService],
})
export class BudgetsModule {}
