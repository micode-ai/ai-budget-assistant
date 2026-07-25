import { create } from 'zustand';
import { api } from '@/services/api';
import type { AnomalyAlert, PriceCheckSummary } from '@budget/shared-types';

interface AlertState {
  alerts: AnomalyAlert[];
  unreadCount: number;
  isLoading: boolean;
  priceCheckSummary: PriceCheckSummary | null;

  loadAlerts: () => Promise<void>;
  loadPriceCheckSummary: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  clearPriceCheckSummary: () => void;
  reset: () => void;
}

export const useAlertStore = create<AlertState>((set, get) => ({
  alerts: [],
  unreadCount: 0,
  isLoading: false,
  priceCheckSummary: null,

  async loadAlerts() {
    set({ isLoading: true });
    try {
      const { alerts, unreadCount } = await api.listAlerts();
      set({ alerts, unreadCount, isLoading: false });
    } catch (e) {
      // Offline or server error — keep whatever we had; feed is server-backed only.
      console.warn('Failed to load alerts:', e);
      set({ isLoading: false });
    }
  },

  async loadPriceCheckSummary() {
    try {
      const summary = await api.getPriceCheckSummary();
      set({ priceCheckSummary: summary });
    } catch (error) {
      // Non-critical decoration on the analytics screen — never surface it.
      console.warn('[alertStore] price-check summary failed', error);
    }
  },

  async markRead(id) {
    const { alerts, unreadCount } = get();
    const target = alerts.find((a) => a.id === id);
    if (!target || target.readAt) return;
    set({
      alerts: alerts.map((a) => (a.id === id ? { ...a, readAt: new Date().toISOString() } : a)),
      unreadCount: Math.max(0, unreadCount - 1),
    });
    api.markAlertRead(id).catch((e) => console.warn('Failed to mark alert read:', e));
  },

  async markAllRead() {
    const now = new Date().toISOString();
    set((s) => ({
      alerts: s.alerts.map((a) => (a.readAt ? a : { ...a, readAt: now })),
      unreadCount: 0,
    }));
    api.markAllAlertsRead().catch((e) => console.warn('Failed to mark alerts read:', e));
  },

  async dismiss(id) {
    set((s) => {
      const target = s.alerts.find((a) => a.id === id);
      return {
        alerts: s.alerts.filter((a) => a.id !== id),
        unreadCount: target && !target.readAt ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
      };
    });
    api.dismissAlert(id).catch((e) => console.warn('Failed to dismiss alert:', e));
  },

  clearPriceCheckSummary() {
    set({ priceCheckSummary: null });
  },

  reset() {
    set({ alerts: [], unreadCount: 0, isLoading: false, priceCheckSummary: null });
  },
}));
