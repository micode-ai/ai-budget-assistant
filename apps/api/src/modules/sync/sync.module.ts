import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { ExpensesModule } from '../expenses/expenses.module';
import { IncomesModule } from '../incomes/incomes.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { CategoriesModule } from '../categories/categories.module';
import { CommunityPriceModule } from '../community-prices/community-price.module';
import { AnomalyModule } from '../anomaly/anomaly.module';

@Module({
  imports: [ExpensesModule, IncomesModule, BudgetsModule, CategoriesModule, CommunityPriceModule, AnomalyModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
