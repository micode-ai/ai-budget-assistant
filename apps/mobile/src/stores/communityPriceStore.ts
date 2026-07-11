import { create } from 'zustand';
import { api } from '@/services/api';
import i18n from '@/i18n';
import { useUpgradeStore } from './upgradeStore';
import type {
  CommunityPriceResponse,
  CommunityProductSearchItem,
  CommunityPricePeriod,
} from '@budget/shared-types';

interface CommunityPriceState {
  searchTerm: string;
  searchResults: CommunityProductSearchItem[];
  isSearching: boolean;
  selectedProduct: string | null;
  result: CommunityPriceResponse | null;
  period: CommunityPricePeriod;
  isLoading: boolean;

  search: (q: string) => Promise<void>;
  loadPrices: (product: string, region: string | null, period?: CommunityPricePeriod) => Promise<void>;
  setPeriod: (period: CommunityPricePeriod) => void;
  reset: () => void;
}

// This is server-only, cross-account anonymous aggregate data — NOT offline-first
// (mirrors priceHistoryStore's read-only pattern, not expenseStore's write pattern).
export const useCommunityPriceStore = create<CommunityPriceState>()((set, get) => ({
  searchTerm: '',
  searchResults: [],
  isSearching: false,
  selectedProduct: null,
  result: null,
  period: '1w',
  isLoading: false,

  search: async (q) => {
    set({ searchTerm: q });
    const term = q.trim();
    if (term.length < 2) {
      set({ searchResults: [], isSearching: false });
      return;
    }
    set({ isSearching: true });
    try {
      const searchResults = await api.searchCommunityProducts(term);
      set({ searchResults, isSearching: false });
    } catch (e) {
      set({ isSearching: false });
      const status = (e as { status?: number }).status;
      if (status === 403) {
        useUpgradeStore.getState().show(i18n.t('communityPrices.paywall'), 'pro');
      } else {
        console.warn('[communityPriceStore] search failed', e);
      }
    }
  },

  loadPrices: async (product, region, period) => {
    const resolvedPeriod = period ?? get().period;
    set({ isLoading: true, selectedProduct: product, period: resolvedPeriod });
    try {
      const result = await api.getCommunityPrices(product, region, resolvedPeriod);
      set({ result, isLoading: false });
    } catch (e) {
      set({ isLoading: false });
      const status = (e as { status?: number }).status;
      if (status === 403) {
        useUpgradeStore.getState().show(i18n.t('communityPrices.paywall'), 'pro');
      } else {
        console.warn('[communityPriceStore] loadPrices failed', e);
      }
    }
  },

  setPeriod: (period) => {
    set({ period });
    const { selectedProduct } = get();
    if (selectedProduct) {
      get().loadPrices(selectedProduct, null, period);
    }
  },

  reset: () =>
    set({
      searchTerm: '',
      searchResults: [],
      isSearching: false,
      selectedProduct: null,
      result: null,
      period: '1w',
      isLoading: false,
    }),
}));
