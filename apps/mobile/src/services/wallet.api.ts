import { httpClient } from './http-client';

export const walletApi = {
  getWalletBalances() {
    return httpClient.request<any[]>('/wallet');
  },

  getWalletSummary() {
    return httpClient.request<any>('/wallet/summary');
  },

  setWalletBalance(data: { localId: string; currencyCode: string; initialAmount: number }) {
    return httpClient.request<any>('/wallet', {
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
    return httpClient.request<any[]>(`/currency-exchanges${query ? `?${query}` : ''}`);
  },

  createCurrencyExchange(data: any) {
    return httpClient.request<any>('/currency-exchanges', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateCurrencyExchange(id: string, data: any) {
    return httpClient.request<any>(`/currency-exchanges/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteCurrencyExchange(id: string) {
    return httpClient.request<void>(`/currency-exchanges/${id}`, { method: 'DELETE' });
  },

  getExchangeRates(baseCurrency: string = 'USD') {
    return httpClient.request<{ base: string; rates: Record<string, number>; updatedAt: string }>(
      `/currency-exchanges/rates?base=${baseCurrency}`,
    );
  },

  getDebtSummary() {
    return httpClient.request<any>('/debts/summary');
  },
};
