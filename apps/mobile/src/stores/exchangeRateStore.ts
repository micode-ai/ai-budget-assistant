import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { api } from '@/services/api';
import { useIncomeStore } from './incomeStore';
import { useExpenseStore } from './expenseStore';

// Lazy getter to avoid circular dependency with authStore
// (authStore imports exchangeRateStore, exchangeRateStore needs authStore)
async function getAuthStore() {
  const { useAuthStore } = await import('./authStore');
  return useAuthStore;
}

interface ExchangeRateState {
  rates: Record<string, number>;
  baseCurrency: string;
  isLoading: boolean;

  convertedIncomeTotal: number;
  convertedExpenseTotal: number;

  loadRates: () => Promise<void>;
  reset: () => void;
}

export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>,
): number {
  if (fromCurrency === toCurrency) return amount;
  const fromRate = rates[fromCurrency];
  const toRate = rates[toCurrency];
  if (!fromRate || fromRate === 0 || !toRate || toRate === 0) return amount;
  // Convert: amount in fromCurrency -> base -> toCurrency
  // rates are relative to baseCurrency, so: amount / fromRate * toRate
  return (amount / fromRate) * toRate;
}

function recomputeConvertedTotals() {
  const { rates, baseCurrency } = useExchangeRateStore.getState();
  if (!baseCurrency || Object.keys(rates).length === 0) return;

  const incomeTotals = useIncomeStore.getState().incomeTotalsByCurrency;
  const expenseTotals = useExpenseStore.getState().expenseTotalsByCurrency;

  const convertedIncomeTotal = Object.entries(incomeTotals).reduce(
    (sum, [currency, amount]) => sum + convertAmount(amount, currency, baseCurrency, rates),
    0,
  );

  const convertedExpenseTotal = Object.entries(expenseTotals).reduce(
    (sum, [currency, amount]) => sum + convertAmount(amount, currency, baseCurrency, rates),
    0,
  );

  useExchangeRateStore.setState({ convertedIncomeTotal, convertedExpenseTotal });
}

export const useExchangeRateStore = create<ExchangeRateState>()(
  subscribeWithSelector((set, get) => ({
    rates: {},
    baseCurrency: '',
    isLoading: false,

    convertedIncomeTotal: 0,
    convertedExpenseTotal: 0,

    loadRates: async () => {
      set({ isLoading: true });
      try {
        const useAuthStore = await getAuthStore();
        const userCurrency = useAuthStore.getState().user?.currencyCode || 'USD';
        const data = await api.getExchangeRates(userCurrency);
        set({
          rates: { ...data.rates, [userCurrency]: 1 },
          baseCurrency: userCurrency,
          isLoading: false,
        });
      } catch {
        set({ isLoading: false });
      }
    },

    reset: () =>
      set({
        rates: {},
        baseCurrency: '',
        isLoading: false,
        convertedIncomeTotal: 0,
        convertedExpenseTotal: 0,
      }),
  })),
);

// Recompute when rates change
useExchangeRateStore.subscribe(
  (s) => s.rates,
  () => recomputeConvertedTotals(),
);

// Recompute when income totals change
useIncomeStore.subscribe(
  (s) => s.incomeTotalsByCurrency,
  () => recomputeConvertedTotals(),
);

// Recompute when expense totals change
useExpenseStore.subscribe(
  (s) => s.expenseTotalsByCurrency,
  () => recomputeConvertedTotals(),
);

// Deferred subscription for auth currency changes (avoids circular dep at module init)
setTimeout(async () => {
  const useAuthStore = await getAuthStore();
  let prevCurrencyCode = useAuthStore.getState().user?.currencyCode;
  useAuthStore.subscribe((s: any) => {
    const curr = s.user?.currencyCode;
    if (curr && curr !== prevCurrencyCode) {
      prevCurrencyCode = curr;
      if (s.isAuthenticated) {
        useExchangeRateStore.getState().loadRates();
      }
    }
  });
}, 0);
