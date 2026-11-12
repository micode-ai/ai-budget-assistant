import { Module } from '@nestjs/common';
import { ChildrenController, ExpenseChildrenController } from './children.controller';
import { ChildrenService } from './children.service';
import { ChildProductRulesService } from './child-product-rules.service';
import { ChildStatementService } from './child-statement.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';

/**
 * Child costs: children, whole-expense and line attribution, learned
 * product → child suggestions, and the Pro statement PDF (on the reports
 * pipeline's pdfkit setup). `SubscriptionsModule` backs `SubscriptionTierGuard`;
 * `CurrencyExchangeModule` provides the one `ExchangeRateService`.
 */
@Module({
  imports: [SubscriptionsModule, CurrencyExchangeModule],
  controllers: [ChildrenController, ExpenseChildrenController],
  providers: [ChildrenService, ChildProductRulesService, ChildStatementService],
  exports: [ChildrenService, ChildProductRulesService],
})
export class ChildrenModule {}
