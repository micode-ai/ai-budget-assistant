import { create } from 'zustand';
import { api } from '@/services/api';
import type { MerchantCategoryRule } from '@budget/shared-types';

interface MerchantRulesState {
  rules: MerchantCategoryRule[];
  isLoaded: boolean;
  loadRules: () => Promise<void>;
  getRuleForMerchant: (merchant: string) => string | null;
  deleteRule: (id: string) => Promise<void>;
}

export const useMerchantRulesStore = create<MerchantRulesState>((set, get) => ({
  rules: [],
  isLoaded: false,

  loadRules: async () => {
    try {
      const rules = await api.listRules();
      set({ rules, isLoaded: true });
    } catch {
      // fail silently; merchant rules are a quality-of-life feature
    }
  },

  getRuleForMerchant: (merchant: string) => {
    const normalized = merchant.trim().toLowerCase();
    const rule = get().rules.find((r) => r.merchantNormalized === normalized);
    return rule?.categoryId ?? null;
  },

  deleteRule: async (id: string) => {
    // Optimistic remove
    set((s) => ({ rules: s.rules.filter((r) => r.id !== id) }));
    try {
      await api.deleteRule(id);
    } catch {
      // Re-sync on failure so UI reflects server truth
      get().loadRules();
    }
  },
}));
