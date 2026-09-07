import { create } from 'zustand';
import { api } from '@/services/api';
import type { PriceHistoryResponse, ProductListItem } from '@budget/shared-types';

interface PriceHistoryState {
  history: PriceHistoryResponse | null;
  products: ProductListItem[];
  isLoading: boolean;
  isLoadingProducts: boolean;
  hasAttemptedLoad: boolean;
  selectedPeriod: '3m' | '6m' | '12m' | 'all';

  loadPriceHistory: (period?: '3m' | '6m' | '12m' | 'all') => Promise<void>;
  loadProducts: () => Promise<void>;
  backfillWithAi: () => Promise<{ updatedCount: number }>;
  upsertAlias: (rawName: string, canonicalName: string) => Promise<void>;
  deleteAlias: (rawName: string) => Promise<void>;
  ignoreProduct: (rawName: string) => Promise<void>;
  mergeProducts: (rawNames: string[], canonicalName: string) => Promise<void>;
  deletePricePoint: (itemId: string) => Promise<void>;
  reset: () => void;
}

export const usePriceHistoryStore = create<PriceHistoryState>()((set, get) => ({
  history: null,
  products: [],
  isLoading: false,
  isLoadingProducts: false,
  hasAttemptedLoad: false,
  selectedPeriod: '6m',

  loadPriceHistory: async (period) => {
    const resolvedPeriod = period ?? get().selectedPeriod;
    set({ isLoading: true, selectedPeriod: resolvedPeriod });
    try {
      const history = await api.getPriceHistory(resolvedPeriod);
      set({ history, isLoading: false, hasAttemptedLoad: true });
    } catch (e) {
      console.warn('[priceHistoryStore] loadPriceHistory failed', e);
      set({ isLoading: false, hasAttemptedLoad: true });
    }
  },

  loadProducts: async () => {
    set({ isLoadingProducts: true });
    try {
      const products = await api.getProducts();
      set({ products, isLoadingProducts: false });
    } catch (e) {
      console.warn('[priceHistoryStore] loadProducts failed', e);
      set({ isLoadingProducts: false });
    }
  },

  // Warns AND rethrows, matching every sibling write action below. It was the
  // one action here that did neither, so a failed backfill produced no log and
  // no rejection the screen could act on - and `products.tsx` swallowed it under
  // a comment that said it had been warned in the store. Both halves of that
  // are fixed: the store logs, the caller still learns it failed.
  //
  // The two reloads cannot land in this catch - each swallows and warns on its
  // own - so what it reports is precisely "the backfill request failed", which
  // is what the siblings' catches report too.
  backfillWithAi: async () => {
    try {
      const result = await api.backfillProductNames();
      await get().loadPriceHistory();
      await get().loadProducts();
      return result;
    } catch (e) {
      console.warn('[priceHistoryStore] backfillWithAi failed', e);
      throw e;
    }
  },

  upsertAlias: async (rawName, canonicalName) => {
    try {
      await api.upsertAlias({ rawName, canonicalName });
      await get().loadPriceHistory();
      await get().loadProducts();
    } catch (e) {
      console.warn('[priceHistoryStore] upsertAlias failed', e);
      throw e;
    }
  },

  deleteAlias: async (rawName) => {
    try {
      await api.deleteAlias(rawName);
      await get().loadPriceHistory();
      await get().loadProducts();
    } catch (e) {
      console.warn('[priceHistoryStore] deleteAlias failed', e);
      throw e;
    }
  },

  ignoreProduct: async (rawName) => {
    try {
      await api.ignoreProduct(rawName);
      await get().loadPriceHistory();
      await get().loadProducts();
    } catch (e) {
      console.warn('[priceHistoryStore] ignoreProduct failed', e);
      throw e;
    }
  },

  mergeProducts: async (rawNames, canonicalName) => {
    try {
      await api.mergeProducts({ rawNames, canonicalName });
      await get().loadPriceHistory();
      await get().loadProducts();
    } catch (e) {
      console.warn('[priceHistoryStore] mergeProducts failed', e);
      throw e;
    }
  },

  deletePricePoint: async (itemId) => {
    try {
      await api.deletePricePoint(itemId);
      await get().loadPriceHistory();
    } catch (e) {
      console.warn('[priceHistoryStore] deletePricePoint failed', e);
      throw e;
    }
  },

  reset: () => set({ history: null, products: [], isLoading: false, isLoadingProducts: false, hasAttemptedLoad: false, selectedPeriod: '6m' }),
}));
