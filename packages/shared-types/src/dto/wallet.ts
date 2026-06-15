import type { Currency } from '../entities';

export interface CreateWalletBalanceDto {
  localId: string;
  currencyCode: Currency;
  initialAmount: number;
}

export interface UpdateWalletBalanceDto {
  initialAmount?: number;
}

export interface CreateCurrencyExchangeDto {
  localId: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  fromAmount: number;
  toAmount: number;
  exchangeRate: number;
  date: string;
  notes?: string;
}

export interface UpdateCurrencyExchangeDto {
  fromCurrency?: Currency;
  toCurrency?: Currency;
  fromAmount?: number;
  toAmount?: number;
  exchangeRate?: number;
  date?: string;
  notes?: string;
  encryptedPayload?: string | null;
  encryptionKeyVersion?: string | number | null;
}

export interface CreateAccountTransferDto {
  localId: string;
  fromAccountId: string;
  fromCurrency: Currency;
  fromAmount: number;
  toAccountId: string;
  toCurrency: Currency;
  toAmount: number;
  exchangeRate: number;
  date: string;
  notes?: string;
  countAsIncome?: boolean;
}

export interface UpdateAccountTransferDto {
  fromAmount?: number;
  toAmount?: number;
  exchangeRate?: number;
  date?: string;
  notes?: string;
  countAsIncome?: boolean;
}

export interface AccountTransferResponse {
  id: string;
  clientId: string;
  userId: string;
  fromAccountId: string;
  fromCurrency: string;
  fromAmount: number;
  toAccountId: string;
  toCurrency: string;
  toAmount: number;
  exchangeRate: number;
  date: string;
  notes?: string;
  countAsIncome: boolean;
  linkedIncomeId?: string;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
  syncVersion?: number;
}

export interface WalletSummaryResponse {
  balances: Array<{
    currencyCode: Currency;
    initialAmount: number;
    totalIncomes: number;
    totalExpenses: number;
    totalExchangedIn: number;
    totalExchangedOut: number;
    totalTransferredIn: number;
    totalTransferredOut: number;
    currentBalance: number;
  }>;
}

export interface ExchangeRatesResponse {
  base: Currency;
  rates: Partial<Record<Currency, number>>;
  updatedAt: string;
}

export interface WalletBalanceHistoryPoint {
  /** ISO date string 'YYYY-MM-DD' */
  date: string;
  /** Balance per currency code at end of this day */
  balances: Record<string, number>;
}

export interface WalletBalanceHistoryResponse {
  points: WalletBalanceHistoryPoint[];
  currencies: string[];
}
