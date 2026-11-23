import { Module } from '@nestjs/common';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { ReportsModule } from '../reports/reports.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AccountGroupsController } from './account-groups.controller';
import { AccountGroupsService } from './account-groups.service';
import { AllAccountsController } from './all-accounts.controller';
import { AllAccountsService } from './all-accounts.service';
import { ConsolidatedReportService } from './consolidated-report.service';

@Module({
  imports: [CurrencyExchangeModule, SubscriptionsModule, ReportsModule],
  controllers: [AllAccountsController, AccountGroupsController],
  providers: [AllAccountsService, AccountGroupsService, ConsolidatedReportService],
  exports: [AllAccountsService, AccountGroupsService],
})
export class AllAccountsModule {}
