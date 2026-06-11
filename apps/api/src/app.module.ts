import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisThrottlerStorage } from './common/cache/redis-throttler-storage';
import { SentryExceptionFilter } from './common/filters/sentry-exception.filter';
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
import { AppVersionsModule } from './modules/app-versions/app-versions.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { CurrencyExchangeModule } from './modules/currency-exchange/currency-exchange.module';
import { DatabaseModule } from './database/database.module';
import { MailModule } from './modules/mail/mail.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { SlackModule } from './modules/slack/slack.module';
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
import { HealthModule } from './modules/health/health.module';
import { ImportWiseModule } from './modules/import-wise/import-wise.module';
import { ImportBankModule } from './modules/import-bank/import-bank.module';
import { ImportBatchesModule } from './modules/import-batches/import-batches.module';
import { UserSubscriptionsModule } from './modules/user-subscriptions/user-subscriptions.module';
import { AnomalyModule } from './modules/anomaly/anomaly.module';
import { CacheModule } from './common/cache/cache.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting — storage backed by Redis so limits survive restarts and work across replicas
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ ttl: 60000, limit: 100 }],
        storage: new RedisThrottlerStorage(config),
      }),
    }),

    // Scheduling
    ScheduleModule.forRoot(),

    // Database
    DatabaseModule,

    // Caching (global)
    CacheModule,

    // Infrastructure
    MailModule,
    TelegramModule,
    WhatsAppModule,
    SlackModule,
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
    AppVersionsModule,
    WalletModule,
    CurrencyExchangeModule,
    InsightsModule,
    SubscriptionsModule,
    AdminModule,
    AnomalyModule,
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
    HealthModule,
    ImportWiseModule,
    ImportBankModule,
    ImportBatchesModule,
    UserSubscriptionsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryExceptionFilter,
    },
  ],
})
export class AppModule {}
