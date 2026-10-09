import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/services/api';
import { useGroupStore } from '@/stores/groupStore';
import type { GroupExpenseItemsView, SetGroupClaimsDto } from '@budget/shared-types';

/**
 * One itemised group expense's lines and claims (ABA-656), `GET /groups/:id/expenses/:expenseId/items`.
 * Server-only like the rest of groups: a failed load is an explicit error state, never an empty list.
 * Every claim write answers with the fresh view, which replaces the local one; the group itself is
 * then reloaded (best effort) because a claim change moves balances and the activity row.
 *
 * `enabled: false` (a plain expense in the edit form) does nothing and reports no error.
 * Writes rethrow, so the screen decides how to word the refusal (409 CLAIMS_CLOSED, 400
 * CLAIM_SHARE_INVALID); a 409 also reloads the view, since the window is not what the screen shows.
 */
export function useGroupExpenseItems(groupId: string, expenseId: string | undefined, enabled = true) {
  const [view, setView] = useState<GroupExpenseItemsView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const loadGroup = useGroupStore((s) => s.loadGroup);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!enabled || !expenseId) return;
    try {
      const next = await api.getGroupExpenseItems(groupId, expenseId);
      if (!live.current) return;
      setView(next);
      setLoadFailed(false);
    } catch (e) {
      console.warn('[useGroupExpenseItems] load failed:', e instanceof Error ? e.message : e);
      if (live.current) setLoadFailed(true);
    }
  }, [enabled, groupId, expenseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const write = useCallback(
    async (fn: () => Promise<GroupExpenseItemsView>) => {
      setBusy(true);
      try {
        const next = await fn();
        if (live.current) setView(next);
        void loadGroup(groupId).catch(() => undefined);
      } catch (e) {
        console.warn('[useGroupExpenseItems] write failed:', e instanceof Error ? e.message : e);
        if ((e as { status?: number } | null)?.status === 409) await reload();
        throw e;
      } finally {
        if (live.current) setBusy(false);
      }
    },
    [groupId, loadGroup, reload],
  );

  const setMine = useCallback(
    (itemIds: string[]) => write(() => api.setMyGroupClaims(groupId, expenseId as string, itemIds)),
    [write, groupId, expenseId],
  );
  const setClaims = useCallback(
    (dto: SetGroupClaimsDto) => write(() => api.setGroupClaims(groupId, expenseId as string, dto)),
    [write, groupId, expenseId],
  );
  const close = useCallback(
    (reopen?: boolean) => write(() => api.closeGroupClaims(groupId, expenseId as string, reopen)),
    [write, groupId, expenseId],
  );

  return { view, loadFailed, busy, reload, setMine, setClaims, close };
}
