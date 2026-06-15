import type { WalletBalance, CurrencyExchange } from '@budget/shared-types';
import type {
  CreateWalletBalanceDto,
  CreateCurrencyExchangeDto,
  UpdateCurrencyExchangeDto,
  WalletSummaryResponse,
  WalletMonthlyHistoryResponse,
  ExchangeRatesResponse,
  DebtSummaryResponse,
} from '@budget/shared-types';
import { httpClient } from './http-client';

export const walletApi = {
  getWalletBalances() {
    return httpClient.request<WalletBalance[]>('/wallet');
  },

  getWalletSummary() {
    return httpClient.request<WalletSummaryResponse>('/wallet/summary');
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
};
