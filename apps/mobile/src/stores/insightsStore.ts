import { create } from 'zustand';
import { api } from '@/services/api';
import type { AIInsightChart, FatFinderReport } from '@budget/shared-types';

interface InsightsState {
  aiInsights: AIInsightChart[];
  isLoading: boolean;
  error: string | null;
  lastFetched: string | null;

  fatFinderReport: FatFinderReport | null;
  fatFinderLoading: boolean;
  fatFinderError: string | null;

  loadAIInsights: (language?: string) => Promise<void>;
  dismissInsight: (id: string) => void;
  loadFatFinder: (language?: string, forceRegenerate?: boolean) => Promise<void>;
  reset: () => void;
}

export const useInsightsStore = create<InsightsState>()((set) => ({
  aiInsights: [],
  isLoading: false,
  error: null,
  lastFetched: null,

  fatFinderReport: null,
  fatFinderLoading: false,
  fatFinderError: null,

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

  loadFatFinder: async (language?: string, forceRegenerate?: boolean) => {
    set({ fatFinderLoading: true, fatFinderError: null });
    try {
      const response = await api.getFatFinderReport(language, forceRegenerate);
      set({
        fatFinderReport: response.report,
        fatFinderLoading: false,
      });
    } catch (err) {
      set({
        fatFinderLoading: false,
        fatFinderError: err instanceof Error ? err.message : 'Failed to load fat finder report',
      });
    }
  },

  reset: () => {
    set({
      aiInsights: [],
      isLoading: false,
      error: null,
      lastFetched: null,
      fatFinderReport: null,
      fatFinderLoading: false,
      fatFinderError: null,
    });
  },
}));
