import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { ExpenseBulkService } from './expense-bulk.service';
import { ExpenseCrossAccountService } from './expense-cross-account.service';
import { ExpenseCreatedHooksService } from './expense-created-hooks.service';
import { ExpenseRecurringCron } from './expense-recurring.cron';
import { BudgetsModule } from '../budgets/budgets.module';
import { GamificationModule } from '../gamification/gamification.module';
import { AnomalyModule } from '../anomaly/anomaly.module';
import { MerchantRulesModule } from '../merchant-rules/merchant-rules.module';
import { FamilyFeedModule } from '../family-feed/family-feed.module';
import { CommunityPriceModule } from '../community-prices/community-price.module';
import { InflationShieldTrackingModule } from '../insights/inflation-shield-tracking.module';
import { ReceiptSplitModule } from '../receipt-split/receipt-split.module';

// Module-cycle check (Fix 3, ABA receipt-split review): ReceiptSplitModule only
// imports DebtsModule, and DebtsModule imports nothing at all (a true leaf on
// the global PrismaService) — so ExpensesModule -> ReceiptSplitModule ->
// DebtsModule is a one-way edge with no path back to ExpensesModule. Real DI is
// safe here; do not revert to importing a standalone function.
@Module({
  imports: [BudgetsModule, GamificationModule, AnomalyModule, MerchantRulesModule, FamilyFeedModule, CommunityPriceModule, InflationShieldTrackingModule, ReceiptSplitModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, ExpenseBulkService, ExpenseCrossAccountService, ExpenseCreatedHooksService, ExpenseRecurringCron],
  exports: [ExpensesService, ExpenseBulkService, ExpenseCrossAccountService],
})
export class ExpensesModule {}
