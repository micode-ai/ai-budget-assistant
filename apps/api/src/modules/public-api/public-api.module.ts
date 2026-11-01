import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { PublicAccountController } from './controllers/public-account.controller';
import { PublicCategoriesController } from './controllers/public-categories.controller';
import { PublicExpensesController } from './controllers/public-expenses.controller';
import { PublicApiExceptionFilter } from './filters/public-api-exception.filter';
import { PublicApiAuthGuard } from './guards/public-api-auth.guard';
import { PublicWriteGuard } from './guards/public-write.guard';
import { PublicApiRateLimitService } from './public-api-rate-limit.service';
import { PublicExpenseWriteAdapter } from './public-expense-write.adapter';

/**
 * The `/public/v1` REST surface for third-party apps (OAuth bearer tokens). Every controller here:
 *   @UseGuards(PublicApiEnabledGuard, PublicApiAuthGuard) + @UseFilters(PublicApiExceptionFilter) on the class,
 *   @RequireScopes(...) on every route (missing = 403; @TokenOnly() is the only opt-out, GET /account),
 *   @PublicWrite() on every mutating route.
 * Not `JwtAuthGuard`/`AccountContextGuard`: the guard derives user + account from the grant.
 * AdminModule is imported only so the exception filter can feed 5xx to the admin live error feed.
 * Expense reads go straight to Prisma (public-expenses.query.ts); writes go through ExpensesService
 * (public-expense-write.adapter.ts), plus BudgetsModule for the budget-alert re-check the app's own
 * expense controller runs (SharedActivityService comes from the global NotificationsModule).
 */
@Module({
  imports: [AdminModule, ExpensesModule, BudgetsModule],
  controllers: [PublicAccountController, PublicCategoriesController, PublicExpensesController],
  providers: [PublicApiAuthGuard, PublicApiRateLimitService, PublicApiExceptionFilter, PublicWriteGuard, PublicExpenseWriteAdapter],
  exports: [PublicApiAuthGuard, PublicApiRateLimitService, PublicApiExceptionFilter, PublicWriteGuard],
})
export class PublicApiModule {}
