import type { Currency, SyncStatus } from './primitives';

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
