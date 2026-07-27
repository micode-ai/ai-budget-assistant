import { create } from 'zustand';
import { api } from '@/services/api';
import type { CreateSplitDto, SplitStateResponse } from '@budget/shared-types';

/**
 * Server-only store for the receipt-split feature (same shape as
 * purchaseRequestStore / tripStore): the split, its shareable links, and each
 * participant's confirmation status all live server-side and must stay
 * consistent across devices, so there is no SQLite mirror and no sync queue.
 */
interface ReceiptSplitState {
  /** The expense this split belongs to, or null before the first load(). */
  expenseId: string | null;
  split: SplitStateResponse | null;
  isLoading: boolean;

  load: (expenseId: string) => Promise<void>;
  create: (expenseId: string, dto: CreateSplitDto) => Promise<void>;
  confirm: (expenseId: string, participantId: string) => Promise<void>;
  cancel: (expenseId: string) => Promise<void>;
}

export const useReceiptSplitStore = create<ReceiptSplitState>()((set, get) => ({
  expenseId: null,
  split: null,
  isLoading: false,

  load: async (expenseId) => {
    const isSameExpense = get().expenseId === expenseId;
    set((s) => ({
      expenseId,
      isLoading: true,
      // Switching to a different expense clears the previous one's split
      // immediately, before the fetch even starts — otherwise expense A's
      // split would stay on screen while expense B's (unsplit) receipt is
      // loading. Same bug class FamilyFeedWidget hit with stale cross-account
      // UI; here the fix is to key the single split slot on the expense it
      // belongs to and reset on any change, rather than reload-on-focus.
      split: isSameExpense ? s.split : null,
    }));

    try {
      const split = await api.getSplit(expenseId);
      // A slower, now-stale request for an expense the user has since
      // navigated away from must not clobber whatever is current.
      if (get().expenseId !== expenseId) return;
      set({ split, isLoading: false });
    } catch (e: unknown) {
      if (get().expenseId !== expenseId) return;

      // getSplit 404s whenever the expense simply has no split yet — the
      // normal state of every unsplit receipt, not a failure. Only a
      // non-404 error is a real failure worth keeping the stale split for
      // and warning about.
      const status = (e as { status?: number } | null)?.status;
      if (status === 404) {
        set({ split: null, isLoading: false });
        return;
      }

      // console.warn, never console.error — RN's LogBox renders console.error
      // as a blocking full-screen red overlay that reads as a crash.
      console.warn('[receiptSplitStore] load failed', e);
      set({ isLoading: false });
    }
  },

  create: async (expenseId, dto) => {
    const split = await api.createSplit(expenseId, dto);
    set({ expenseId, split });
  },

  confirm: async (expenseId, participantId) => {
    const previous = get().split;
    if (!previous) return;

    set({
      split: {
        ...previous,
        participants: previous.participants.map((p) =>
          p.id === participantId ? { ...p, status: 'settled' } : p,
        ),
      },
    });

    try {
      const updated = await api.confirmSplitParticipant(expenseId, participantId);
      set((s) => {
        if (!s.split) return s;
        return {
          split: {
            ...s.split,
            participants: s.split.participants.map((p) => (p.id === participantId ? updated : p)),
          },
        };
      });
    } catch (e) {
      set({ split: previous });
      throw e;
    }
  },

  cancel: async (expenseId) => {
    await api.cancelSplit(expenseId);
    set({ split: null });
  },
}));
