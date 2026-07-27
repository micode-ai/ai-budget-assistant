import type { Currency, AiResponseMode, AiModel, ThemeMode, SettleMethod } from './primitives';

export interface NotificationPreferences {
  budgetAlerts: boolean;
  sharedAccountActivity: boolean;
  debtReminders: boolean;
  recurringExpenses: boolean;
}

/** One payment method a user has configured, e.g. for the receipt-split guest page.
 * A user may offer several (BLIK + Revolut + PayPal, ...) — see `UserPaymentMethod`
 * Prisma model. Ordered by `sortOrder` server-side before this shape is returned. */
export interface UserPaymentMethod {
  method: SettleMethod;
  handle: string;
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
  /** LEGACY single-pair fallback — how the user prefers to be paid back, used to
  * build the pay button on a receipt-split guest link when `paymentMethods` is
  * empty. Falls back further to the account-member handle (trip settle-up) when
  * unset. Prefer `paymentMethods` for new code. */
  paymentMethod?: SettleMethod | null;
  paymentHandle?: string | null;
  /** The authoritative, ordered list of payment methods this user has configured.
  * Empty means none configured — the API falls back to the legacy single pair. */
  paymentMethods?: UserPaymentMethod[];
  createdAt: Date;
  updatedAt: Date;
  lastSyncAt?: Date;
}
