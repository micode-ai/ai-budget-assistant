import { create } from 'zustand';
import {
  ACCOUNT_SCOPED_EMPTY,
  forgetAccount,
  type InvestmentState,
} from './investmentShared';
import { createHoldingActions } from './investmentHoldingActions';
import { createTransactionActions } from './investmentTransactionActions';
import { createAnalyticsActions } from './investmentAnalyticsActions';

// Composition only: holdings CRUD, transactions CRUD and analytics/insights
// live in investment*Actions.ts and share this store's set/get.
export const useInvestmentStore = create<InvestmentState>()((set, get) => ({
  holdings: [],
  transactions: {},
  summary: null,
  performanceData: null,
  performanceLoading: false,
  assetPriceHistory: {},
  assetPriceLoading: false,
  isLoading: false,
  error: null,
  lastPriceUpdate: null,
  aiInsights: [],
  insightsLoading: false,
  insightsError: null,

  ...createHoldingActions(set, get),
  ...createTransactionActions(set, get),
  ...createAnalyticsActions(set, get),

  clearError: () => set({ error: null }),

  reset: () => {
    forgetAccount();
    set({
      ...ACCOUNT_SCOPED_EMPTY,
      performanceLoading: false,
      assetPriceLoading: false,
      isLoading: false,
      error: null,
      insightsLoading: false,
      insightsError: null,
    });
  },
}));
