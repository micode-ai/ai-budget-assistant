import type { WalletBalance, CurrencyExchange, ExchangeRateWatch } from '@budget/shared-types';
import type {
  CreateWalletBalanceDto,
  CreateCurrencyExchangeDto,
  UpdateCurrencyExchangeDto,
  WalletSummaryResponse,
  AllWalletSummariesResponse,
  WalletMonthlyHistoryResponse,
  ExchangeRatesResponse,
  DebtSummaryResponse,
  CreateExchangeRateWatchDto,
} from '@budget/shared-types';
import { httpClient } from './http-client';

export const walletApi = {
  getWalletBalances() {
    return httpClient.request<WalletBalance[]>('/wallet');
  },

  getWalletSummary() {
    return httpClient.request<WalletSummaryResponse>('/wallet/summary');
  },

  /** Balances for every account the user belongs to — the transfer form needs the other side too. */
  getAllWalletSummaries() {
    return httpClient.request<AllWalletSummariesResponse>('/wallet/summaries');
  },

  setWalletBalance(data: CreateWalletBalanceDto) {
    return httpClient.request<WalletBalance>('/wallet', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteWalletBalance(currencyCode: string) {
    return httpClient.request<void>(`/wallet/${currencyCode}`, { method: 'DELETE' });
  },

  getCurrencyExchanges(filters?: { startDate?: string; endDate?: string }) {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    const query = params.toString();
    return httpClient.request<CurrencyExchange[]>(`/currency-exchanges${query ? `?${query}` : ''}`);
  },

  createCurrencyExchange(data: CreateCurrencyExchangeDto) {
    return httpClient.request<CurrencyExchange>('/currency-exchanges', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateCurrencyExchange(id: string, data: UpdateCurrencyExchangeDto) {
    return httpClient.request<CurrencyExchange>(`/currency-exchanges/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteCurrencyExchange(id: string) {
    return httpClient.request<void>(`/currency-exchanges/${id}`, { method: 'DELETE' });
  },

  getExchangeRates(baseCurrency: string = 'USD') {
    return httpClient.request<ExchangeRatesResponse>(
      `/currency-exchanges/rates?base=${baseCurrency}`,
    );
  },

  getWalletMonthlyHistory(months: number = 6) {
    return httpClient.request<WalletMonthlyHistoryResponse>(
      `/wallet/balance-history/monthly?months=${months}`,
    );
  },

  getDebtSummary() {
    return httpClient.request<DebtSummaryResponse>('/debts/summary');
  },

  getRateWatches() {
    return httpClient.request<ExchangeRateWatch[]>('/rate-watches');
  },

  createRateWatch(data: CreateExchangeRateWatchDto) {
    return httpClient.request<ExchangeRateWatch>('/rate-watches', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteRateWatch(id: string) {
    return httpClient.request<void>(`/rate-watches/${id}`, { method: 'DELETE' });
  },
};
