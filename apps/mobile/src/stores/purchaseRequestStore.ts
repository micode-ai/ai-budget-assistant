import { create } from 'zustand';
import { api } from '@/services/api';
import { useExpenseStore } from '@/stores/expenseStore';
import { useFamilyFeedStore } from '@/stores/familyFeedStore';
import type {
  PurchaseRequest,
  PurchaseRequestStatus,
  CreatePurchaseRequestDto,
  UpdatePurchaseRequestDto,
  VotePurchaseRequestDto,
  ApprovalRule,
} from '@budget/shared-types';

interface PurchaseRequestState {
  requests: PurchaseRequest[];
  isLoading: boolean;
  pendingCount: number;

  loadRequests: (status?: PurchaseRequestStatus) => Promise<void>;
  createRequest: (dto: CreatePurchaseRequestDto) => Promise<void>;
  updateRequest: (id: string, dto: UpdatePurchaseRequestDto) => Promise<void>;
  vote: (id: string, dto: VotePurchaseRequestDto) => Promise<void>;
  convertToPlanned: (id: string) => Promise<string>;
  markAsPurchased: (prId: string) => Promise<void>;
  cancelRequest: (id: string) => Promise<void>;
  updateApprovalRule: (rule: ApprovalRule) => Promise<void>;
  loadPendingCount: () => Promise<void>;
  reset: () => void;
}

export const usePurchaseRequestStore = create<PurchaseRequestState>()((set, get) => ({
  requests: [],
  isLoading: false,
  pendingCount: 0,

  loadRequests: async (status?) => {
    set({ isLoading: true });
    try {
      const requests = await api.getPurchaseRequests(status);
      set({ requests, isLoading: false });
    } catch (e) {
      console.warn('[purchaseRequestStore] loadRequests failed', e);
      set({ isLoading: false });
    }
  },

  createRequest: async (dto) => {
    const pr = await api.createPurchaseRequest(dto);
    set((s) => ({ requests: [pr, ...s.requests] }));
    void useFamilyFeedStore.getState().loadFeed().catch(() => {});
  },

  updateRequest: async (id, dto) => {
    const updated = await api.updatePurchaseRequest(id, dto);
    set((s) => ({ requests: s.requests.map((r) => (r.id === id ? updated : r)) }));
  },

  vote: async (id, dto) => {
    const updated = await api.votePurchaseRequest(id, dto);
    set((s) => ({ requests: s.requests.map((r) => (r.id === id ? updated : r)) }));
  },

  convertToPlanned: async (id) => {
    const { expenseId } = await api.convertPurchaseRequest(id);
    // Reload to get updated plannedExpenseId
    const updated = await api.getPurchaseRequest(id);
    set((s) => ({ requests: s.requests.map((r) => (r.id === id ? updated : r)) }));
    // Refresh expense list so the newly-created planned expense is available
    // before navigating to its detail screen.
    await useExpenseStore.getState().loadExpenses({ force: true });
    return expenseId;
  },

  markAsPurchased: async (prId) => {
    await api.markPurchaseRequestAsPurchased(prId);
    set((s) => ({
      requests: s.requests.map((r) =>
        r.id === prId ? { ...r, status: 'PURCHASED' as const } : r,
      ),
    }));
  },

  cancelRequest: async (id) => {
    await api.cancelPurchaseRequest(id);
    set((s) => ({ requests: s.requests.filter((r) => r.id !== id) }));
    void useFamilyFeedStore.getState().loadFeed().catch(() => {});
  },

  updateApprovalRule: async (rule) => {
    await api.updateAccountApprovalRule(rule);
  },

  loadPendingCount: async () => {
    try {
      const count = await api.getPurchaseRequestPendingCount();
      set({ pendingCount: count });
    } catch {
      // non-critical
    }
  },

  reset: () => set({ requests: [], pendingCount: 0, isLoading: false }),
}));
