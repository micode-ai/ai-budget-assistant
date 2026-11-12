import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { IncomesModule } from '../incomes/incomes.module';
import { PublicAnalyticsController } from './controllers/public-analytics.controller';
import { PublicAccountController } from './controllers/public-account.controller';
import { PublicAccountsController } from './controllers/public-accounts.controller';
import { PublicBudgetsController } from './controllers/public-budgets.controller';
import { PublicCategoriesController } from './controllers/public-categories.controller';
import { PublicExpensesController } from './controllers/public-expenses.controller';
import { PublicIncomesController } from './controllers/public-incomes.controller';
import { PublicApiExceptionFilter } from './filters/public-api-exception.filter';
import { PublicApiAuthGuard } from './guards/public-api-auth.guard';
import { PublicApiAuthorizer } from './public-api-authorizer.service';
import { PublicWriteGuard } from './guards/public-write.guard';
import { PublicAnalyticsService } from './public-analytics.service';
import { PublicApiRateLimitService } from './public-api-rate-limit.service';
import { PublicExpenseWriteAdapter } from './public-expense-write.adapter';
import { PublicBudgetWriteAdapter } from './public-budget-write.adapter';
import { PublicIncomeWriteAdapter } from './public-income-write.adapter';

/**
 * The `/public/v1` REST surface for third-party apps (OAuth bearer tokens). Every controller here:
 *   @UseGuards(PublicApiEnabledGuard, PublicApiAuthGuard) + @UseFilters(PublicApiExceptionFilter) on the class,
 *   @RequireScopes(...) on every route (missing = 403; @TokenOnly() is the only opt-out, GET /account),
 *   @PublicWrite() on every mutating route.
 * Not `JwtAuthGuard`/`AccountContextGuard`: the guard derives user + account from the grant.
 * AdminModule is imported only so the exception filter can feed 5xx to the admin live error feed.
 * Expense reads go straight to Prisma (public-expenses.query.ts); writes go through ExpensesService / IncomesService
 * (public-expense-write.adapter.ts, public-income-write.adapter.ts), plus BudgetsModule for the budget-alert re-check the app's own
 * expense controller runs (SharedActivityService comes from the global NotificationsModule).
 * CurrencyExchangeModule supplies the ONE ExchangeRateService instance analytics converts with (never
 * provide a second one here).
 */
@Module({
  imports: [AdminModule, ExpensesModule, IncomesModule, BudgetsModule, CurrencyExchangeModule],
  controllers: [PublicAccountController, PublicAccountsController, PublicBudgetsController, PublicCategoriesController, PublicExpensesController, PublicIncomesController, PublicAnalyticsController],
  providers: [PublicApiAuthGuard, PublicApiAuthorizer, PublicApiRateLimitService, PublicApiExceptionFilter, PublicWriteGuard, PublicExpenseWriteAdapter, PublicIncomeWriteAdapter, PublicBudgetWriteAdapter, PublicAnalyticsService],
  // PublicApiAuthorizer and PublicAnalyticsService also serve the MCP tools (McpModule).
  exports: [PublicApiAuthGuard, PublicApiAuthorizer, PublicApiRateLimitService, PublicApiExceptionFilter, PublicWriteGuard, PublicAnalyticsService],
})
export class PublicApiModule {}
