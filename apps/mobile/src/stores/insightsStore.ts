import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import { api } from '@/services/api';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useUpgradeStore } from '@/stores/upgradeStore';
import i18n from '@/i18n';
import type { AIInsightChart, FatFinderReport, SafeToSpendResponse } from '@budget/shared-types';

const stsStorage = new MMKV({ id: 'safe-to-spend' });

const STS_DATA_KEY = 'sts_data';
const STS_UPDATED_AT_KEY = 'sts_updated_at';

function loadCachedSafeToSpend(): SafeToSpendResponse | null {
  try {
    const raw = stsStorage.getString(STS_DATA_KEY);
    return raw ? (JSON.parse(raw) as SafeToSpendResponse) : null;
  } catch {
    return null;
  }
}

function loadCachedSafeToSpendUpdatedAt(): number | null {
  const raw = stsStorage.getNumber(STS_UPDATED_AT_KEY);
  return raw ?? null;
}

interface InsightsState {
  aiInsights: AIInsightChart[];
  isLoading: boolean;
  error: string | null;
  lastFetched: string | null;
  aiInsightsProGated: boolean;

  fatFinderReport: FatFinderReport | null;
  fatFinderLoading: boolean;
  fatFinderError: string | null;
  fatFinderMonth: number; // 1-based (1=January)
  fatFinderYear: number;
  fatFinderProGated: boolean;

  safeToSpend: SafeToSpendResponse | null;
  safeToSpendLoading: boolean;
  safeToSpendError: string | null;
  safeToSpendUpdatedAt: number | null;

  loadAIInsights: (language?: string) => Promise<void>;
  dismissInsight: (id: string) => void;
  loadFatFinder: (language?: string, forceRegenerate?: boolean, month?: number, year?: number) => Promise<void>;
  setFatFinderPeriod: (month: number, year: number) => void;
  loadSafeToSpend: () => Promise<void>;
  reset: () => void;
}

const now = new Date();

export const useInsightsStore = create<InsightsState>()((set) => ({
  aiInsights: [],
  isLoading: false,
  error: null,
  lastFetched: null,
  aiInsightsProGated: false,

  fatFinderReport: null,
  fatFinderLoading: false,
  fatFinderError: null,
  fatFinderMonth: now.getMonth() + 1,
  fatFinderYear: now.getFullYear(),
  fatFinderProGated: false,

  safeToSpend: loadCachedSafeToSpend(),
  safeToSpendLoading: false,
  safeToSpendError: null,
  safeToSpendUpdatedAt: loadCachedSafeToSpendUpdatedAt(),

  loadAIInsights: async (language?: string) => {
    set({ isLoading: true, error: null, aiInsightsProGated: false });
    try {
      const response = await api.getAIInsights(language);
      set({
        aiInsights: response.insights,
        isLoading: false,
        lastFetched: response.generatedAt,
      });
    } catch (err) {
      const isProGated = (err as { status?: number }).status === 403;
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load insights',
        aiInsightsProGated: isProGated,
      });
      if (isProGated) {
        useUpgradeStore.getState().show(i18n.t('insights.proRequired'), 'pro');
      }
    }
  },

  dismissInsight: (id: string) => {
    set((state) => ({
      aiInsights: state.aiInsights.filter((i) => i.id !== id),
    }));
  },

  loadFatFinder: async (language?: string, forceRegenerate?: boolean, month?: number, year?: number) => {
    set({ fatFinderLoading: true, fatFinderError: null, fatFinderProGated: false });
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
      const isProGated = (err as { status?: number }).status === 403;
      set({
        fatFinderLoading: false,
        fatFinderError: err instanceof Error ? err.message : 'Failed to load fat finder report',
        fatFinderProGated: isProGated,
      });
      if (isProGated) {
        useUpgradeStore.getState().show(i18n.t('subscription.limitReachedBody'), 'pro');
      }
    }
  },

  setFatFinderPeriod: (month: number, year: number) => {
    set({ fatFinderMonth: month, fatFinderYear: year, fatFinderReport: null });
  },

  loadSafeToSpend: async () => {
    set({ safeToSpendLoading: true, safeToSpendError: null });
    try {
      const response = await api.getSafeToSpend();
      const updatedAt = Date.now();
      // Persist to MMKV for offline display
      stsStorage.set(STS_DATA_KEY, JSON.stringify(response));
      stsStorage.set(STS_UPDATED_AT_KEY, updatedAt);
      set({
        safeToSpend: response,
        safeToSpendLoading: false,
        safeToSpendUpdatedAt: updatedAt,
      });
    } catch (err) {
      // Leave cached data intact; only update loading/error state
      set({
        safeToSpendLoading: false,
        safeToSpendError: err instanceof Error ? err.message : 'Failed to load safe-to-spend',
      });
    }
  },

  reset: () => {
    const current = new Date();
    set({
      aiInsights: [],
      isLoading: false,
      error: null,
      lastFetched: null,
      aiInsightsProGated: false,
      fatFinderReport: null,
      fatFinderLoading: false,
      fatFinderError: null,
      fatFinderMonth: current.getMonth() + 1,
      fatFinderYear: current.getFullYear(),
      fatFinderProGated: false,
      safeToSpend: null,
      safeToSpendLoading: false,
      safeToSpendError: null,
      safeToSpendUpdatedAt: null,
    });
  },
}));
