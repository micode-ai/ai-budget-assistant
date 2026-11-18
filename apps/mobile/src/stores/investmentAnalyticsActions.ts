/**
 * investmentAnalyticsActions.ts — summary / performance / pricing / insights extracted from investmentStore.ts.
 */
import { api } from '../services/api';
import * as investmentRepo from '../db/investmentRepository';
import {
  claimAccount,
  getAccountId,
  getUserId,
  switchedAway,
  type InvestmentGet,
  type InvestmentSet,
  type InvestmentState,
} from './investmentShared';

export const createAnalyticsActions = (
  set: InvestmentSet,
  get: InvestmentGet,
): Pick<InvestmentState, 'loadSummary' | 'loadPerformance' | 'loadAssetPriceHistory' | 'refreshPrices' | 'loadInvestmentInsights' | 'dismissInsight'> => ({
  loadSummary: async () => {
    const accountId = getAccountId();
    claimAccount(set, accountId);
    set({ isLoading: true });
    try {
      const response = await api.getPortfolioSummary();
      if (switchedAway(accountId)) return;
      if (response) {
        set((state) => {
          // Enrich holdings with price and allocation data from summary
          const summaryHoldings = response.summary?.holdings || [];
          const enrichedHoldings = summaryHoldings.length > 0
            ? state.holdings.map((h) => {
                const sh = summaryHoldings.find(
                  (s: any) => s.holdingId === h.id || s.holdingId === h.serverId,
                );
                if (sh && h.asset) {
                  return {
                    ...h,
                    asset: { ...h.asset, currentPrice: sh.currentPrice },
                    allocationPercent: sh.allocationPercent,
                  };
                }
                return h;
              })
            : state.holdings;

          return {
            summary: response.summary,
            lastPriceUpdate: response.lastPriceUpdate,
            holdings: enrichedHoldings,
            isLoading: false,
          };
        });

        // Also update local asset prices in SQLite for offline access
        const summaryHoldings = response.summary?.holdings || [];
        for (const sh of summaryHoldings) {
          if (sh.assetId && sh.currentPrice) {
            await investmentRepo.updateAssetPrice(sh.assetId, sh.currentPrice);
          }
        }
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  loadPerformance: async (period: string = 'month') => {
    const accountId = getAccountId();
    claimAccount(set, accountId);
    set({ performanceLoading: true });
    try {
      const data = await api.getPortfolioAnalytics(period);
      if (switchedAway(accountId)) return;
      if (data?.performance?.dates?.length > 0) {
        set({
          performanceData: {
            dates: data.performance.dates,
            values: data.performance.values,
          },
          performanceLoading: false,
        });
      } else {
        console.warn('[InvestmentStore] loadPerformance: no chart data returned', {
          hasPerformance: !!data?.performance,
          datesLength: data?.performance?.dates?.length ?? 0,
        });
        set({ performanceData: null, performanceLoading: false });
      }
    } catch (err) {
      console.error('[InvestmentStore] loadPerformance failed:', err);
      set({ performanceData: null, performanceLoading: false });
    }
  },

  loadAssetPriceHistory: async (holdingId: string, days: number = 30) => {
    // Use server holding ID for API call
    const holding = get().holdings.find((h) => h.id === holdingId);
    const serverHoldingId = holding?.serverId || holdingId;

    set({ assetPriceLoading: true });
    try {
      const data = await api.getAssetPriceHistory(serverHoldingId, days);
      if (data?.dates?.length > 0) {
        set((state) => ({
          assetPriceHistory: {
            ...state.assetPriceHistory,
            [holdingId]: { dates: data.dates, prices: data.prices },
          },
          assetPriceLoading: false,
        }));
      } else {
        set({ assetPriceLoading: false });
      }
    } catch {
      set({ assetPriceLoading: false });
    }
  },

  refreshPrices: async () => {
    try {
      await api.refreshInvestmentPrices();
      // Reload summary after refresh
      await get().loadSummary();
    } catch (error) {
      console.error('[InvestmentStore] Failed to refresh prices:', error);
    }
  },

  loadInvestmentInsights: async (language?: string) => {
    const accountId = getAccountId();
    claimAccount(set, accountId);
    set({ insightsLoading: true, insightsError: null });
    try {
      const response = await api.getInvestmentInsights(language);
      if (switchedAway(accountId)) return;
      set({
        aiInsights: response.insights || [],
        insightsLoading: false,
      });
    } catch (error) {
      set({
        insightsError: (error as Error).message,
        insightsLoading: false,
      });
    }
  },

  dismissInsight: (id: string) => {
    set((state) => ({
      aiInsights: state.aiInsights.filter((insight) => insight.id !== id),
    }));
  },
});
