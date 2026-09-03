import type { Currency, SyncStatus, RateWatchDirection } from './primitives';

export interface WalletBalance {
  id: string;
  localId: string;
  serverId?: string;
  /** Server-side copy of the mobile device's local ID. Present on API responses. */
  clientId?: string | null;
  accountId: string;
  userId: string;
  currencyCode: Currency;
  initialAmount: number;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface CurrencyExchange {
  id: string;
  localId: string;
  serverId?: string;
  /** Server-side copy of the mobile device's local ID. Present on API responses. */
  clientId?: string | null;
  accountId: string;
  userId: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  fromAmount: number;
  toAmount: number;
  exchangeRate: number;
  date: Date;
  notes?: string;
  externalRef?: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

export interface AccountTransfer {
  id: string;
  localId: string;
  serverId?: string;
  userId: string;
  fromAccountId: string;
  fromCurrency: Currency;
  fromAmount: number;
  toAccountId: string;
  toCurrency: Currency;
  toAmount: number;
  exchangeRate: number;
  date: Date;
  notes?: string;
  countAsIncome: boolean;
  linkedIncomeId?: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  syncStatus: SyncStatus;
  syncVersion: number;
}

/**
 * A user's personal "notify me when this pair hits my target" alert. No `accountId` —
 * a rate target isn't shared-account data. Server-only, no offline SQLite mirror
 * (cheap to refetch, not synced).
 */
export interface ExchangeRateWatch {
  id: string;
  userId: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  targetRate: number;
  direction: RateWatchDirection;
  isActive: boolean;
  createdAt: Date;
  triggeredAt?: Date | null;
  triggeredRate?: number | null;
}

export interface WalletSummary {
  currencyCode: Currency;
  initialAmount: number;
  totalIncomes: number;
  totalExpenses: number;
  totalExchangedIn: number;
  totalExchangedOut: number;
  totalTransferredIn: number;
  totalTransferredOut: number;
  currentBalance: number;
}
