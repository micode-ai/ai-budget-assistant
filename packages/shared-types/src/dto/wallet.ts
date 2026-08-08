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
  /**
   * Re-homing a transfer. `fromAccountId`/`toAccountId` and their currencies travel
   * together: editing a transfer into "Personal (PLN) -> Vacation (EUR)" while keeping
   * the old currency would store a nonsense row. The server re-validates membership on
   * whichever side changed and requires the request's account to stay a party to the
   * transfer, since `findAll` filters on `fromAccountId`/`toAccountId`.
   */
  fromAccountId?: string;
  toAccountId?: string;
  fromCurrency?: Currency;
  toCurrency?: Currency;
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

export interface AccountWalletSummary {
  accountId: string;
  balances: WalletSummaryResponse['balances'];
}

/**
 * Wallet balances for every account the caller is a member of, in one round trip.
 * Feeds the transfer form, which has to show the balance of an account other than
 * the currently selected one — something `GET /wallet/summary` cannot do, and the
 * mobile SQLite mirror cannot answer either (an account the user has never opened
 * has no local rows, so a locally computed balance would silently read too low).
 */
export interface AllWalletSummariesResponse {
  accounts: AccountWalletSummary[];
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

export interface WalletMonthlyDeltaPoint {
  /** Month key 'YYYY-MM' */
  month: string;
  /** Net balance change during this month, per currency code */
  deltas: Record<string, number>;
}

export interface WalletMonthlyHistoryResponse {
  months: WalletMonthlyDeltaPoint[];
  currencies: string[];
}
