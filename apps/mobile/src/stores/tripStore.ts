import { create } from 'zustand';
import { tripApi } from '../services/trip.api';
import type {
  SettleUpBalance,
  SuggestedTransfer,
  SettleUpPayResponse,
  SettleUpTransaction,
} from '@budget/shared-types';

interface TripState {
  balances: SettleUpBalance[];
  suggestedTransfers: SuggestedTransfer[];
  // Real server-side pending SettleUpTransaction rows (status === 'pending').
  // Populated by loadSettleUp — this is what lets the RECEIVER's device (which
  // never called payDebt itself) discover a real transaction id to confirm.
  pendingTransactions: SettleUpTransaction[];
  isLoading: boolean;

  loadSettleUp: (accountId: string) => Promise<void>;
  payDebt: (
    accountId: string,
    fromUserId: string,
    toUserId: string,
    amount: number,
  ) => Promise<SettleUpPayResponse>;
  confirmPayment: (accountId: string, transactionId: string) => Promise<void>;
}

export const useTripStore = create<TripState>()((set, get) => ({
  balances: [],
  suggestedTransfers: [],
  pendingTransactions: [],
  isLoading: false,

  loadSettleUp: async (accountId) => {
    set({ isLoading: true });
    try {
      const response = await tripApi.getSettleUp(accountId);
      set({
        balances: response.balances,
        suggestedTransfers: response.suggestedTransfers,
        pendingTransactions: response.pendingTransactions ?? [],
        isLoading: false,
      });
    } catch (e) {
      console.warn('[tripStore] loadSettleUp failed', e);
      set({ isLoading: false });
    }
  },

  payDebt: async (accountId, fromUserId, toUserId, amount) => {
    return tripApi.payDebt(accountId, { fromUserId, toUserId, amount });
  },

  confirmPayment: async (accountId, transactionId) => {
    await tripApi.confirmPayment(accountId, transactionId);
    await get().loadSettleUp(accountId);
  },
}));
