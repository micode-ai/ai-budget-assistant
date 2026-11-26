import { Module } from '@nestjs/common';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { BudgetAlertService } from './budget-alert.service';
import { GamificationModule } from '../gamification/gamification.module';
import { MerchantCapsModule } from '../merchant-caps/merchant-caps.module';

@Module({
  imports: [GamificationModule, MerchantCapsModule],
  controllers: [BudgetsController],
  providers: [BudgetsService, BudgetAlertService],
  exports: [BudgetsService, BudgetAlertService],
})
export class BudgetsModule {}
