import { create } from 'zustand';
import { api } from '@/services/api';
import type { ExchangeRateWatch, CreateExchangeRateWatchDto } from '@budget/shared-types';

// Server-only, no SQLite mirror — same precedent as userSubscriptionStore: cheap to
// refetch, low volume, no offline-write requirement.
interface ExchangeRateWatchState {
  watches: ExchangeRateWatch[];
  isLoading: boolean;
  error: string | null;

  loadWatches: () => Promise<void>;
  createWatch: (dto: CreateExchangeRateWatchDto) => Promise<ExchangeRateWatch>;
  deleteWatch: (id: string) => Promise<void>;
  getWatchesForPair: (fromCurrency: string, toCurrency: string) => ExchangeRateWatch[];
}

export const useExchangeRateWatchStore = create<ExchangeRateWatchState>((set, get) => ({
  watches: [],
  isLoading: false,
  error: null,

  async loadWatches() {
    set({ isLoading: true, error: null });
    try {
      const watches = await api.getRateWatches();
      set({ watches, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to load rate alerts' });
    }
  },

  async createWatch(dto) {
    const watch = await api.createRateWatch(dto);
    set((s) => ({ watches: [watch, ...s.watches] }));
    return watch;
  },

  async deleteWatch(id) {
    await api.deleteRateWatch(id);
    set((s) => ({ watches: s.watches.filter((w) => w.id !== id) }));
  },

  getWatchesForPair(fromCurrency, toCurrency) {
    return get().watches.filter(
      (w) => w.isActive && w.fromCurrency === fromCurrency && w.toCurrency === toCurrency,
    );
  },
}));
