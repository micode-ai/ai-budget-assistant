import { create } from 'zustand';
import { api } from '@/services/api';
import type { UserSubscription, BillingCycle } from '@budget/shared-types';

interface CreateInput {
  name: string;
  amount: number;
  currencyCode: string;
  billingCycle: BillingCycle;
  nextRenewalDate: string;
  categoryId?: string;
  notes?: string;
  detectedFrom?: string;
}

interface UpdateInput {
  name?: string;
  amount?: number;
  currencyCode?: string;
  billingCycle?: BillingCycle;
  nextRenewalDate?: string;
  categoryId?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

interface UserSubscriptionState {
  subscriptions: UserSubscription[];
  isLoading: boolean;
  error: string | null;

  loadSubscriptions: () => Promise<void>;
  createSubscription: (dto: CreateInput) => Promise<UserSubscription>;
  updateSubscription: (id: string, patch: UpdateInput) => Promise<void>;
  deleteSubscription: (id: string) => Promise<void>;
  getTotalMonthlyEquivalent: () => number;
  getActiveCount: () => number;
}

export const useUserSubscriptionStore = create<UserSubscriptionState>((set, get) => ({
  subscriptions: [],
  isLoading: false,
  error: null,

  async loadSubscriptions() {
    set({ isLoading: true, error: null });
    try {
      const subscriptions = await api.list();
      set({ subscriptions, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to load subscriptions' });
    }
  },

  async createSubscription(dto) {
    const sub = await api.create(dto);
    set((s) => ({ subscriptions: [sub, ...s.subscriptions] }));
    return sub;
  },

  async updateSubscription(id, patch) {
    const updated = await api.update(id, patch);
    set((s) => ({
      subscriptions: s.subscriptions.map((sub) => (sub.id === id ? updated : sub)),
    }));
  },

  async deleteSubscription(id) {
    await api.remove(id);
    set((s) => ({ subscriptions: s.subscriptions.filter((sub) => sub.id !== id) }));
  },

  getTotalMonthlyEquivalent() {
    return get()
      .subscriptions.filter((s) => s.isActive)
      .reduce((sum, s) => sum + s.monthlyEquivalent, 0);
  },

  getActiveCount() {
    return get().subscriptions.filter((s) => s.isActive).length;
  },
}));
