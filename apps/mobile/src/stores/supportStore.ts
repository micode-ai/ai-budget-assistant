import { create } from 'zustand';
import { supportApi } from '@/services/api';

/**
 * Unread developer replies, for the dot on the settings "Write to the
 * developer" row (phone hub and desktop left pane).
 *
 * Only the count lives here. The conversation itself is screen state in
 * `useSupportThread` — it is online-only and unmounts with the screen, so a
 * conversation never outlives the screen that shows it.
 *
 * User-scoped (support threads belong to the user, not an account), so it is
 * NOT cleared on an account switch — only on sign-out, through `reset()`.
 * A failed refresh keeps the last known count rather than claiming zero.
 */
interface SupportState {
  unreadCount: number;
  refreshUnread: () => Promise<void>;
  setUnread: (count: number) => void;
  reset: () => void;
}

export const useSupportStore = create<SupportState>((set) => ({
  unreadCount: 0,

  refreshUnread: async () => {
    try {
      const thread = await supportApi.getThread(undefined, 1);
      set({ unreadCount: thread.userUnreadCount });
    } catch (e) {
      // Expected offline; never an error overlay.
      console.warn('[support] unread refresh failed', e);
    }
  },

  setUnread: (count) => set({ unreadCount: Math.max(0, count) }),

  reset: () => set({ unreadCount: 0 }),
}));
