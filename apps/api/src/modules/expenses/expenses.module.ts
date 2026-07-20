import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { ExpenseBulkService } from './expense-bulk.service';
import { ExpenseCrossAccountService } from './expense-cross-account.service';
import { ExpenseRecurringCron } from './expense-recurring.cron';
import { BudgetsModule } from '../budgets/budgets.module';
import { GamificationModule } from '../gamification/gamification.module';
import { AnomalyModule } from '../anomaly/anomaly.module';
import { MerchantRulesModule } from '../merchant-rules/merchant-rules.module';
import { FamilyFeedModule } from '../family-feed/family-feed.module';
import { CommunityPriceModule } from '../community-prices/community-price.module';
import { InflationShieldTrackingModule } from '../insights/inflation-shield-tracking.module';

@Module({
  imports: [BudgetsModule, GamificationModule, AnomalyModule, MerchantRulesModule, FamilyFeedModule, CommunityPriceModule, InflationShieldTrackingModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, ExpenseBulkService, ExpenseCrossAccountService, ExpenseRecurringCron],
  exports: [ExpensesService, ExpenseBulkService, ExpenseCrossAccountService],
})
export class ExpensesModule {}
