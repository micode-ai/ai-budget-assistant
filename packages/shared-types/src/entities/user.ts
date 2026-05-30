import type { Currency, AiResponseMode, AiModel } from './primitives';

export interface NotificationPreferences {
  budgetAlerts: boolean;
  sharedAccountActivity: boolean;
  debtReminders: boolean;
  recurringExpenses: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  currencyCode: Currency;
  timezone: string;
  defaultAccountId?: string;
  isAdmin?: boolean;
  isVerified: boolean;
  aiResponseMode?: AiResponseMode;
  aiModel?: AiModel;
  createdAt: Date;
  updatedAt: Date;
  lastSyncAt?: Date;
}
