export type Currency = 'USD' | 'EUR' | 'PLN' | 'GBP' | 'UAH' | 'RUB' | 'BYN';

export type SyncStatus = 'pending' | 'synced' | 'conflict' | 'error';

export type ExpenseSource = 'manual' | 'voice' | 'ocr' | 'import' | 'telegram' | 'whatsapp' | 'slack';

export type IncomeSource = 'manual' | 'voice' | 'ocr' | 'import' | 'telegram' | 'whatsapp' | 'slack';

export type BudgetPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export type CategoryType = 'income' | 'expense';

export type AccountType = 'personal' | 'business' | 'shared' | 'investment';

export type AccountRole = 'owner' | 'editor' | 'viewer';

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export type NotificationType = 'budget_alert' | 'shared_expense' | 'spending_anomaly' | 'debt_reminder' | 'recurring_expense' | 'chat_mention';

export type RecurringPeriod = 'weekly' | 'monthly' | 'yearly';

export type SubscriptionTier = 'free' | 'pro' | 'business';

export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing' | 'paused';

export type InsightType = 'spending_anomaly' | 'budget_prediction' | 'saving_tip' | 'achievement';

export type AiResponseMode = 'simple' | 'balanced' | 'expert';

export type AiModel = 'fast' | 'balanced' | 'quality';

export type GoalStatus = 'active' | 'paused' | 'completed' | 'failed';

export type AssetType = 'stock' | 'crypto' | 'etf' | 'bond' | 'commodity';

export type InvestmentTransactionType = 'buy' | 'sell';

export type DebtStatus = 'active' | 'paid' | 'overdue';

export type EncryptionTier = 0 | 1 | 2;

export type KeyWrappingMethod = 'ecdh' | 'master_key';

export type ReportFormat = 'csv' | 'pdf' | 'excel';

export type ReportStatus = 'pending' | 'generating' | 'completed' | 'failed';

export type DigestFrequency = 'weekly' | 'monthly';

export type AppPlatform = 'ios' | 'android';

export type ImportBatchStatus = 'committed' | 'rolled_back';
