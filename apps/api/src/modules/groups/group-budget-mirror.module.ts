import { Module } from '@nestjs/common';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { GroupBudgetMirrorService } from './group-budget-mirror.service';
import { GroupBudgetMirrorCron } from './group-budget-mirror.cron';

/**
 * The budget mirror on its own (ABA-660), so the personal-write side (ExpensesModule, IncomesModule,
 * the bank and Wise imports) can trigger a reconcile without importing GroupsModule. It depends only on
 * the global PrismaService/CacheService and the singleton ExchangeRateService, so no module cycle is
 * possible. GroupsModule imports it for the ledger-write hooks and the routes.
 */
@Module({
  imports: [CurrencyExchangeModule],
  providers: [GroupBudgetMirrorService, GroupBudgetMirrorCron],
  exports: [GroupBudgetMirrorService],
})
export class GroupBudgetMirrorModule {}
