import { create } from 'zustand';
import { randomUUID } from 'expo-crypto';
import { api } from '@/services/api';
import { isLedgerChanged, isSettlementExceedsBalance, type SettleResult } from '@/features/groups/groupMath';
import type {
  CreateGroupDto,
  CreateGroupExpenseDto,
  GroupActivityItem,
  GroupDetail,
  GroupMember,
  GroupSummary,
  JoinGroupDto,
  SettleMethod,
  UpdateGroupDto,
  UpdateGroupExpenseDto,
  UpdateGroupMemberDto,
} from '@budget/shared-types';

/**
 * Server-only store for shared expense groups (same reasoning as receiptSplitStore): a
 * multi-writer ledger that guests also write to, so no SQLite mirror and no sync queue.
 * Not account-scoped, but cleared on sign-out. Failures log with console.warn (expected offline)
 * and rethrow so screens can show the message; screens gate writes while offline.
 */
interface GroupState {
  groups: GroupSummary[];
  current: GroupDetail | null;
  activity: GroupActivityItem[];
  /** Cursor for the next older page; null when exhausted. */
  activityNextBefore: string | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;

  loadGroups: () => Promise<void>;
  loadGroup: (id: string) => Promise<void>;
  loadMoreActivity: () => Promise<void>;
  create: (dto: CreateGroupDto) => Promise<GroupDetail>;
  join: (dto: JoinGroupDto) => Promise<GroupDetail>;
  linkGuest: (code: string) => Promise<GroupDetail>;
  addExpense: (
    groupId: string,
    dto: Omit<CreateGroupExpenseDto, 'clientRequestId'>,
    clientRequestId?: string,
  ) => Promise<void>;
  updateExpense: (groupId: string, expenseId: string, dto: UpdateGroupExpenseDto) => Promise<void>;
  deleteExpense: (groupId: string, expenseId: string) => Promise<void>;
  /** Resolves `{ ok: false, reason: 'ledgerChanged' }` (after reloading) on 409 LEDGER_CHANGED. */
  settle: (
    groupId: string,
    transfer: { fromMemberId: string; toMemberId: string; amount: number; method?: SettleMethod },
  ) => Promise<SettleResult>;
  voidSettlement: (groupId: string, settlementId: string) => Promise<void>;
  addMember: (groupId: string, displayName: string) => Promise<GroupMember>;
  updateMember: (groupId: string, memberId: string, dto: UpdateGroupMemberDto) => Promise<void>;
  removeMember: (groupId: string, memberId: string) => Promise<void>;
  /** ABA-651: owner frees one guest's browser claim; reloads the group (members + the event row). */
  resetMemberClaim: (groupId: string, memberId: string) => Promise<void>;
  updateGroup: (groupId: string, dto: UpdateGroupDto) => Promise<void>;
  rotateLink: (groupId: string) => Promise<string>;
  /** ABA-650: hand the group to another app-user member. Reloads on 409 OWNER_CHANGED, then rethrows. */
  transferOwnership: (groupId: string, memberId: string) => Promise<void>;
  /** ABA-650: take over an orphaned group. Reloads on 409 GROUP_HAS_OWNER, then rethrows. */
  adoptGroup: (groupId: string) => Promise<void>;
  archive: (groupId: string, force?: boolean) => Promise<void>;
  removeGroup: (groupId: string) => Promise<void>;
  reset: () => void;
}

const initial = {
  groups: [] as GroupSummary[],
  current: null as GroupDetail | null,
  activity: [] as GroupActivityItem[],
  activityNextBefore: null as string | null,
  isLoading: false,
  isLoadingMore: false,
  error: null as string | null,
};

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : 'Request failed';
}

export const useGroupStore = create<GroupState>()((set, get) => {
  /** Run a request; log with warn, record the error, rethrow. */
  async function run<T>(label: string, fn: () => Promise<T>): Promise<T> {
    try {
      set({ error: null });
      return await fn();
    } catch (e) {
      console.warn(`[groupStore] ${label} failed:`, messageOf(e));
      set({ error: messageOf(e) });
      throw e;
    }
  }

  /** Apply a mutation's returned detail and refresh the first activity page (best effort). */
  async function applyDetail(detail: GroupDetail) {
    set({ current: detail });
    try {
      const page = await api.getGroupActivity(detail.id);
      if (get().current?.id === detail.id) {
        set({ activity: page.items, activityNextBefore: page.nextBefore });
      }
    } catch (e) {
      console.warn('[groupStore] activity refresh failed:', messageOf(e));
    }
  }

  return {
    ...initial,

    loadGroups: async () => {
      set({ isLoading: true });
      try {
        const groups = await run('loadGroups', () => api.listGroups());
        set({ groups });
      } finally {
        set({ isLoading: false });
      }
    },

    loadGroup: async (id) => {
      if (get().current && get().current?.id !== id) {
        set({ current: null, activity: [], activityNextBefore: null });
      }
      set({ isLoading: true });
      try {
        const [detail, page] = await run('loadGroup', () =>
          Promise.all([api.getGroup(id), api.getGroupActivity(id)]),
        );
        set({ current: detail, activity: page.items, activityNextBefore: page.nextBefore });
      } finally {
        set({ isLoading: false });
      }
    },

    loadMoreActivity: async () => {
      const { current, activityNextBefore, isLoadingMore } = get();
      if (!current || !activityNextBefore || isLoadingMore) return;
      set({ isLoadingMore: true });
      try {
        const page = await run('loadMoreActivity', () =>
          api.getGroupActivity(current.id, { before: activityNextBefore }),
        );
        if (get().current?.id === current.id) {
          set((s) => ({
            activity: [...s.activity, ...page.items],
            activityNextBefore: page.nextBefore,
          }));
        }
      } finally {
        set({ isLoadingMore: false });
      }
    },

    create: async (dto) => {
      const detail = await run('create', () => api.createGroup(dto));
      set({ current: detail, activity: [], activityNextBefore: null });
      await get().loadGroups().catch(() => undefined);
      return detail;
    },

    join: async (dto) => {
      const detail = await run('join', () => api.joinGroup(dto));
      set({ current: detail });
      await get().loadGroups().catch(() => undefined);
      return detail;
    },

    linkGuest: async (code) => {
      const detail = await run('linkGuest', () => api.linkGuestGroup({ code }));
      set({ current: detail });
      await get().loadGroups().catch(() => undefined);
      return detail;
    },

    addExpense: async (groupId, dto, clientRequestId) => {
      const detail = await run('addExpense', () =>
        api.createGroupExpense(groupId, {
          ...dto,
          clientRequestId: clientRequestId ?? randomUUID(),
        }),
      );
      await applyDetail(detail);
    },

    updateExpense: async (groupId, expenseId, dto) => {
      await applyDetail(
        await run('updateExpense', () => api.updateGroupExpense(groupId, expenseId, dto)),
      );
    },

    deleteExpense: async (groupId, expenseId) => {
      await applyDetail(await run('deleteExpense', () => api.deleteGroupExpense(groupId, expenseId)));
    },

    settle: async (groupId, transfer) => {
      const ledgerVersion = get().current?.ledgerVersion;
      if (ledgerVersion === undefined) throw new Error('Group not loaded');
      try {
        const detail = await run('settle', () =>
          api.createGroupSettlement(groupId, {
            clientRequestId: randomUUID(),
            ...transfer,
            ledgerVersion,
          }),
        );
        await applyDetail(detail);
        return { ok: true };
      } catch (e) {
        if (isLedgerChanged(e)) {
          await get().loadGroup(groupId).catch(() => undefined);
          set({ error: null });
          return { ok: false, reason: 'ledgerChanged' };
        }
        // ABA-652: the amount no longer fits the balances (the form's bound was stale). Reload so
        // the screen shows the new bound.
        if (isSettlementExceedsBalance(e)) {
          await get().loadGroup(groupId).catch(() => undefined);
          set({ error: null });
          return { ok: false, reason: 'exceedsBalance' };
        }
        throw e;
      }
    },

    voidSettlement: async (groupId, settlementId) => {
      await applyDetail(
        await run('voidSettlement', () => api.voidGroupSettlement(groupId, settlementId)),
      );
    },

    addMember: async (groupId, displayName) => {
      const member = await run('addMember', () => api.addGroupMember(groupId, displayName));
      await get().loadGroup(groupId);
      return member;
    },

    updateMember: async (groupId, memberId, dto) => {
      await run('updateMember', () => api.updateGroupMember(groupId, memberId, dto));
      await get().loadGroup(groupId);
    },

    removeMember: async (groupId, memberId) => {
      await run('removeMember', () => api.removeGroupMember(groupId, memberId));
      await get().loadGroup(groupId);
    },

    resetMemberClaim: async (groupId, memberId) => {
      try {
        await run('resetMemberClaim', () => api.resetGroupMemberClaim(groupId, memberId));
      } catch (e) {
        // 409 NOT_CLAIMED / 404: the list is stale (they already left, linked or forgot the device).
        const status = (e as { status?: number } | undefined)?.status;
        if (status === 409 || status === 404) await get().loadGroup(groupId).catch(() => undefined);
        throw e;
      }
      await get().loadGroup(groupId);
    },

    updateGroup: async (groupId, dto) => {
      const detail = await run('updateGroup', () => api.updateGroup(groupId, dto));
      set({ current: detail });
    },

    rotateLink: async (groupId) => {
      const { guestUrl } = await run('rotateLink', () => api.rotateGroupLink(groupId));
      set((s) => (s.current?.id === groupId ? { current: { ...s.current, guestUrl } } : {}));
      return guestUrl;
    },

    transferOwnership: async (groupId, memberId) => {
      try {
        await applyDetail(await run('transferOwnership', () => api.transferGroupOwner(groupId, memberId)));
      } catch (e) {
        if ((e as { status?: number } | undefined)?.status === 409) {
          await get().loadGroup(groupId).catch(() => undefined);
        }
        throw e;
      }
    },

    adoptGroup: async (groupId) => {
      try {
        await applyDetail(await run('adoptGroup', () => api.adoptGroup(groupId)));
      } catch (e) {
        if ((e as { status?: number } | undefined)?.status === 409) {
          await get().loadGroup(groupId).catch(() => undefined);
        }
        throw e;
      }
    },

    archive: async (groupId, force) => {
      const detail = await run('archive', () => api.archiveGroup(groupId, force));
      set({ current: detail });
      await get().loadGroups().catch(() => undefined);
    },

    removeGroup: async (groupId) => {
      await run('removeGroup', () => api.deleteGroup(groupId));
      set((s) => ({
        groups: s.groups.filter((g) => g.id !== groupId),
        ...(s.current?.id === groupId
          ? { current: null, activity: [], activityNextBefore: null }
          : {}),
      }));
    },

    reset: () => set({ ...initial }),
  };
});
