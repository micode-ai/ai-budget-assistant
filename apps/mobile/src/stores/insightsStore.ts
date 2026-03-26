import { create } from 'zustand';
import { api } from '@/services/api';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import type { AIInsightChart, FatFinderReport } from '@budget/shared-types';

interface InsightsState {
  aiInsights: AIInsightChart[];
  isLoading: boolean;
  error: string | null;
  lastFetched: string | null;

  fatFinderReport: FatFinderReport | null;
  fatFinderLoading: boolean;
  fatFinderError: string | null;
  fatFinderMonth: number; // 1-based (1=January)
  fatFinderYear: number;

  loadAIInsights: (language?: string) => Promise<void>;
  dismissInsight: (id: string) => void;
  loadFatFinder: (language?: string, forceRegenerate?: boolean, month?: number, year?: number) => Promise<void>;
  setFatFinderPeriod: (month: number, year: number) => void;
  reset: () => void;
}

const now = new Date();

export const useInsightsStore = create<InsightsState>()((set) => ({
  aiInsights: [],
  isLoading: false,
  error: null,
  lastFetched: null,

  fatFinderReport: null,
  fatFinderLoading: false,
  fatFinderError: null,
  fatFinderMonth: now.getMonth() + 1,
  fatFinderYear: now.getFullYear(),

  loadAIInsights: async (language?: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.getAIInsights(language);
      set({
        aiInsights: response.insights,
        isLoading: false,
        lastFetched: response.generatedAt,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load insights',
      });
    }
  },

  dismissInsight: (id: string) => {
    set((state) => ({
      aiInsights: state.aiInsights.filter((i) => i.id !== id),
    }));
  },

  loadFatFinder: async (language?: string, forceRegenerate?: boolean, month?: number, year?: number) => {
    set({ fatFinderLoading: true, fatFinderError: null });
    if (month != null && year != null) {
      set({ fatFinderMonth: month, fatFinderYear: year });
    }
    try {
      const response = await api.getFatFinderReport(language, forceRegenerate, month, year);
      set({
        fatFinderReport: response.report,
        fatFinderLoading: false,
      });
      useSubscriptionStore.getState().loadUsage();
    } catch (err) {
      set({
        fatFinderLoading: false,
        fatFinderError: err instanceof Error ? err.message : 'Failed to load fat finder report',
      });
    }
  },

  setFatFinderPeriod: (month: number, year: number) => {
    set({ fatFinderMonth: month, fatFinderYear: year, fatFinderReport: null });
  },

  reset: () => {
    const current = new Date();
    set({
      aiInsights: [],
      isLoading: false,
      error: null,
      lastFetched: null,
      fatFinderReport: null,
      fatFinderLoading: false,
      fatFinderError: null,
      fatFinderMonth: current.getMonth() + 1,
      fatFinderYear: current.getFullYear(),
    });
  },
}));
