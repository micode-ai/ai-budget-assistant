import { create } from 'zustand';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import type { FeedGroup } from '@budget/shared-types';

interface FamilyFeedState {
  groups: FeedGroup[];
  isLoading: boolean;

  loadFeed: () => Promise<void>;
  react: (eventId: string, emoji: string) => Promise<void>;
  removeReaction: (eventId: string) => Promise<void>;
  reset: () => void;
}

export const useFamilyFeedStore = create<FamilyFeedState>()((set, get) => ({
  groups: [],
  isLoading: false,

  loadFeed: async () => {
    set({ isLoading: true });
    try {
      const groups = await api.getFamilyFeed();
      set({ groups, isLoading: false });
    } catch (e) {
      console.warn('[familyFeedStore] loadFeed failed', e);
      set({ isLoading: false });
    }
  },

  react: async (eventId, emoji) => {
    const myUserId = useAuthStore.getState().user?.id ?? '';
    const prev = get().groups;

    // optimistic update: remove caller's previous reaction from all buckets, then add new emoji
    set((s) => ({
      groups: s.groups.map((g) => {
        if (g.id !== eventId) return g;
        const withoutMe = g.reactions
          .map((r) => ({
            ...r,
            userIds: r.userIds.filter((uid) => uid !== myUserId),
            count: r.userIds.filter((uid) => uid !== myUserId).length,
          }))
          .filter((r) => r.count > 0);

        const existing = withoutMe.find((r) => r.emoji === emoji);
        const reactions = existing
          ? withoutMe.map((r) =>
              r.emoji === emoji
                ? { ...r, count: r.count + 1, userIds: [...r.userIds, myUserId] }
                : r,
            )
          : [...withoutMe, { emoji, count: 1, userIds: [myUserId] }];

        return { ...g, reactions, myReaction: emoji };
      }),
    }));

    try {
      await api.reactToFeedEvent(eventId, emoji);
    } catch (e) {
      console.warn('[familyFeedStore] react failed', e);
      set({ groups: prev });
    }
  },

  removeReaction: async (eventId) => {
    const myUserId = useAuthStore.getState().user?.id ?? '';
    const prev = get().groups;

    // optimistic update: remove caller's reaction from all emoji buckets
    set((s) => ({
      groups: s.groups.map((g) => {
        if (g.id !== eventId) return g;
        const reactions = g.reactions
          .map((r) => ({
            ...r,
            userIds: r.userIds.filter((uid) => uid !== myUserId),
            count: r.userIds.filter((uid) => uid !== myUserId).length,
          }))
          .filter((r) => r.count > 0);
        return { ...g, reactions, myReaction: null };
      }),
    }));

    try {
      await api.removeFeedReaction(eventId);
    } catch (e) {
      console.warn('[familyFeedStore] removeReaction failed', e);
      set({ groups: prev });
    }
  },

  reset: () => set({ groups: [], isLoading: false }),
}));
