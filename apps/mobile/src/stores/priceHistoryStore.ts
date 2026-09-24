import { create } from 'zustand';
import { api } from '@/services/api';
import type { PriceHistoryResponse, PriceHistoryProduct, ProductListItem } from '@budget/shared-types';

interface PriceHistoryState {
  history: PriceHistoryResponse | null;
  products: ProductListItem[];
  isLoading: boolean;
  isLoadingProducts: boolean;
  hasAttemptedLoad: boolean;
  selectedPeriod: '3m' | '6m' | '12m' | 'all';
  /** The product opened from `ProductsSettings`' search → detail flow — NOT
   *  fed by `history` (see `loadProductDetail`'s doc), so it needs its own
   *  loading/selection state independent of the period-scoped `history`. */
  selectedProductDetail: PriceHistoryProduct | null;
  isLoadingProductDetail: boolean;

  loadPriceHistory: (period?: '3m' | '6m' | '12m' | 'all') => Promise<void>;
  loadProducts: () => Promise<void>;
  backfillWithAi: () => Promise<{ updatedCount: number }>;
  upsertAlias: (rawName: string, canonicalName: string) => Promise<void>;
  deleteAlias: (rawName: string) => Promise<void>;
  ignoreProduct: (rawName: string) => Promise<void>;
  mergeProducts: (rawNames: string[], canonicalName: string) => Promise<void>;
  deletePricePoint: (itemId: string) => Promise<void>;
  loadProductDetail: (canonicalName: string) => Promise<void>;
  clearProductDetail: () => void;
  reset: () => void;
}

export const usePriceHistoryStore = create<PriceHistoryState>()((set, get) => ({
  history: null,
  products: [],
  isLoading: false,
  isLoadingProducts: false,
  hasAttemptedLoad: false,
  selectedPeriod: '6m',
  selectedProductDetail: null,
  isLoadingProductDetail: false,

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
      // Keep the open detail sheet (if any) in sync — it is not derived from
      // `history`, so deleting a point there would otherwise leave a stale
      // row visible until the modal is closed and reopened.
      const detail = get().selectedProductDetail;
      if (detail) await get().loadProductDetail(detail.canonicalName);
    } catch (e) {
      console.warn('[priceHistoryStore] deletePricePoint failed', e);
      throw e;
    }
  },

  // Fetch-and-set, warns on failure rather than throwing — mirrors
  // `loadPriceHistory`/`loadProducts` (a read), not the mutation actions above.
  loadProductDetail: async (canonicalName) => {
    set({ isLoadingProductDetail: true });
    try {
      const detail = await api.getProductDetail(canonicalName);
      set({ selectedProductDetail: detail, isLoadingProductDetail: false });
    } catch (e) {
      console.warn('[priceHistoryStore] loadProductDetail failed', e);
      set({ selectedProductDetail: null, isLoadingProductDetail: false });
    }
  },

  clearProductDetail: () => set({ selectedProductDetail: null, isLoadingProductDetail: false }),

  reset: () => set({
    history: null,
    products: [],
    isLoading: false,
    isLoadingProducts: false,
    hasAttemptedLoad: false,
    selectedPeriod: '6m',
    selectedProductDetail: null,
    isLoadingProductDetail: false,
  }),
}));
