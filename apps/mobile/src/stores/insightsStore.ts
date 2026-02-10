import { create } from 'zustand';
import { api } from '@/services/api';
import type { AIInsightChart } from '@budget/shared-types';

interface InsightsState {
  aiInsights: AIInsightChart[];
  isLoading: boolean;
  error: string | null;
  lastFetched: string | null;

  loadAIInsights: (language?: string) => Promise<void>;
  dismissInsight: (id: string) => void;
  reset: () => void;
}

export const useInsightsStore = create<InsightsState>()((set, get) => ({
  aiInsights: [],
  isLoading: false,
  error: null,
  lastFetched: null,

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

  reset: () => {
    set({ aiInsights: [], isLoading: false, error: null, lastFetched: null });
  },
}));
