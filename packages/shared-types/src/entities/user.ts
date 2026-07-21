import type { Currency, AiResponseMode, AiModel, ThemeMode } from './primitives';

export interface NotificationPreferences {
  budgetAlerts: boolean;
  sharedAccountActivity: boolean;
  debtReminders: boolean;
  recurringExpenses: boolean;
}

export interface User {
  id: string;
  email: string;
  googleId?: string;
  name: string;
  currencyCode: Currency;
  timezone: string;
  defaultAccountId?: string;
  isAdmin?: boolean;
  isVerified: boolean;
  aiResponseMode?: AiResponseMode;
  aiModel?: AiModel;
  contributeCommunityPrices?: boolean;
  themeMode?: ThemeMode;
  accentColor?: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastSyncAt?: Date;
}
