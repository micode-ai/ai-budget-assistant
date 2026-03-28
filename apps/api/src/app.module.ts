import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { IncomesModule } from './modules/incomes/incomes.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { SyncModule } from './modules/sync/sync.module';
import { AiModule } from './modules/ai/ai.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { CurrencyExchangeModule } from './modules/currency-exchange/currency-exchange.module';
import { DatabaseModule } from './database/database.module';
import { MailModule } from './modules/mail/mail.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { InsightsModule } from './modules/insights/insights.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { AdminModule } from './modules/admin/admin.module';
import { TagsModule } from './modules/tags/tags.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { AccountTransferModule } from './modules/account-transfers/account-transfer.module';
import { InvestmentsModule } from './modules/investments/investments.module';
import { EncryptionModule } from './modules/encryption/encryption.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ReportsModule } from './modules/reports/reports.module';
import { BackupsModule } from './modules/backups/backups.module';
import { DebtsModule } from './modules/debts/debts.module';
import { ReferralsModule } from './modules/referrals/referrals.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),

    // Scheduling
    ScheduleModule.forRoot(),

    // Database
    DatabaseModule,

    // Infrastructure
    MailModule,
    TelegramModule,
    NotificationsModule,

    // Feature modules
    AuthModule,
    UsersModule,
    AccountsModule,
    ExpensesModule,
    IncomesModule,
    BudgetsModule,
    CategoriesModule,
    SyncModule,
    AiModule,
    AnalyticsModule,
    WalletModule,
    CurrencyExchangeModule,
    InsightsModule,
    SubscriptionsModule,
    AdminModule,
    TagsModule,
    ProjectsModule,
    GamificationModule,
    AccountTransferModule,
    InvestmentsModule,
    EncryptionModule,
    ReportsModule,
    BackupsModule,
    DebtsModule,
    ReferralsModule,
  ],
})
export class AppModule {}
