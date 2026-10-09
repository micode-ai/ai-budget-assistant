import { create } from 'zustand';
import { api } from '@/services/api';
import { hydrateTransactions } from './hydrateTransactions';
import { useAccountStore } from './accountStore';
import type {
  CreateGroupCashLinkDto,
  GroupBudgetLinksView,
  GroupBudgetMirrorView,
  SetGroupBudgetMirrorDto,
} from '@budget/shared-types';

/**
 * "Count my share in my budget" (ABA-661), per group: the mirror's state and the links view.
 * Server-only like `groupStore` (the server writes the share rows; they reach the device through the
 * normal expense pull, never from here). Keyed by group id so the members card and the detail page's
 * "may be counted twice" card read one copy, and a change in the members dialog shows on the page
 * under it. Cleared on sign-out. Failures `console.warn` and rethrow, for the screen to explain.
 */
interface GroupBudgetState {
  mirrors: Record<string, GroupBudgetMirrorView>;
  links: Record<string, GroupBudgetLinksView>;
  /** Group ids whose last load failed, so a screen can tell "failed" from "not loaded yet". */
  failed: Record<string, boolean>;

  loadMirror: (groupId: string) => Promise<void>;
  loadLinks: (groupId: string) => Promise<void>;
  enable: (groupId: string, dto: SetGroupBudgetMirrorDto) => Promise<GroupBudgetMirrorView>;
  disable: (groupId: string) => Promise<void>;
  link: (groupId: string, dto: CreateGroupCashLinkDto) => Promise<void>;
  acceptSuggestion: (groupId: string, suggestionId: string) => Promise<void>;
  rejectSuggestion: (groupId: string, suggestionId: string) => Promise<void>;
  unlink: (groupId: string, linkId: string) => Promise<void>;
  reset: () => void;
}

const OFF: GroupBudgetMirrorView = {
  status: 'off',
  pausedReason: null,
  accountId: null,
  categoryId: null,
  from: null,
  shareRowCount: 0,
};

/**
 * Share rows and link flags changed on the server: when the mirror's account is the one on screen,
 * pull it now rather than waiting for the next window. Fire-and-forget.
 */
function refreshAccount(accountId: string | null | undefined) {
  if (!accountId || useAccountStore.getState().currentAccountId !== accountId) return;
  void hydrateTransactions({ force: true }).catch((e) => console.warn('[groupBudget] refresh failed', e));
}

export const useGroupBudgetStore = create<GroupBudgetState>((set, get) => {
  const applyLinks = (groupId: string, view: GroupBudgetLinksView) =>
    set((s) => ({
      links: { ...s.links, [groupId]: view },
      mirrors: { ...s.mirrors, [groupId]: view.mirror },
      failed: { ...s.failed, [groupId]: false },
    }));

  const linkWrite = async (groupId: string, call: () => Promise<GroupBudgetLinksView>) => {
    try {
      const view = await call();
      applyLinks(groupId, view);
      refreshAccount(view.mirror.accountId);
    } catch (e) {
      console.warn('[groupBudget] link write failed', e);
      // A stale list (a suggestion that is gone, a leg linked elsewhere) is the usual cause.
      void get().loadLinks(groupId).catch(() => undefined);
      throw e;
    }
  };

  return {
    mirrors: {},
    links: {},
    failed: {},

    loadMirror: async (groupId) => {
      try {
        const view = await api.getGroupBudgetMirror(groupId);
        set((s) => ({ mirrors: { ...s.mirrors, [groupId]: view }, failed: { ...s.failed, [groupId]: false } }));
      } catch (e) {
        console.warn('[groupBudget] loadMirror failed', e);
        set((s) => ({ failed: { ...s.failed, [groupId]: true } }));
        throw e;
      }
    },

    loadLinks: async (groupId) => {
      try {
        applyLinks(groupId, await api.getGroupBudgetLinks(groupId));
      } catch (e) {
        console.warn('[groupBudget] loadLinks failed', e);
        set((s) => ({ failed: { ...s.failed, [groupId]: true } }));
        throw e;
      }
    },

    enable: async (groupId, dto) => {
      const previous = get().mirrors[groupId]?.accountId ?? null;
      let view: GroupBudgetMirrorView;
      try {
        view = await api.setGroupBudgetMirror(groupId, dto);
      } catch (e) {
        console.warn('[groupBudget] enable failed', e);
        throw e;
      }
      set((s) => ({ mirrors: { ...s.mirrors, [groupId]: view } }));
      refreshAccount(view.accountId);
      if (previous && previous !== view.accountId) refreshAccount(previous);
      void get().loadLinks(groupId).catch(() => undefined);
      return view;
    },

    disable: async (groupId) => {
      const previous = get().mirrors[groupId]?.accountId ?? null;
      try {
        await api.deleteGroupBudgetMirror(groupId);
      } catch (e) {
        console.warn('[groupBudget] disable failed', e);
        throw e;
      }
      set((s) => {
        const links = { ...s.links };
        delete links[groupId];
        return { mirrors: { ...s.mirrors, [groupId]: OFF }, links };
      });
      refreshAccount(previous);
    },

    link: (groupId, dto) => linkWrite(groupId, () => api.createGroupBudgetLink(groupId, dto)),
    acceptSuggestion: (groupId, id) => linkWrite(groupId, () => api.acceptGroupBudgetSuggestion(groupId, id)),
    rejectSuggestion: (groupId, id) => linkWrite(groupId, () => api.rejectGroupBudgetSuggestion(groupId, id)),
    unlink: (groupId, linkId) => linkWrite(groupId, () => api.deleteGroupBudgetLink(groupId, linkId)),

    reset: () => set({ mirrors: {}, links: {}, failed: {} }),
  };
});
