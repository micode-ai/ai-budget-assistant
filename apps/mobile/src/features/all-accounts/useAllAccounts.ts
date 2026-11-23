import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MMKV } from 'react-native-mmkv';
import type { AllAccountsAnalyticsResponse } from '@budget/shared-types';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { periodRange, type PeriodPreset } from './periods';

const storage = new MMKV({ id: 'all-accounts' });

function readExcluded(userId: string): string[] | null {
  try {
    const raw = storage.getString(`excluded:${userId}`);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

/** The exclusion list the all-accounts screen uses: the stored one, else investment accounts switched off. */
export function resolveExcludedAccounts(userId: string | undefined, accounts: { id: string; type: string }[]): string[] {
  const stored = userId ? readExcluded(userId) : null;
  return stored ?? accounts.filter((a) => a.type === 'investment').map((a) => a.id);
}

function writeExcluded(userId: string, ids: string[]) {
  try {
    storage.set(`excluded:${userId}`, JSON.stringify(ids));
  } catch {
    // A device without storage just forgets the choice.
  }
}

/**
 * All-accounts analytics (or one account group's, with `groupId`).
 *
 * UI note (Task 6): rows in `data.accounts` with `encrypted: true` or
 * `included: false` come back with zero figures — render them as "not included",
 * never as 0. `failed` is a load error and must show a retry, never zeros.
 */
export function useAllAccounts(opts: { groupId?: string } = {}) {
  const { groupId } = opts;
  const userId = useAuthStore((s) => s.user?.id);
  const accounts = useAccountStore((s) => s.accounts);
  const [stored, setStored] = useState<string[] | null>(() => (userId ? readExcluded(userId) : null));
  const [preset, setPreset] = useState<PeriodPreset>('thisMonth');
  const [custom, setCustom] = useState<{ start: string; end: string } | undefined>(undefined);
  const [data, setData] = useState<AllAccountsAnalyticsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (userId) setStored(readExcluded(userId));
  }, [userId]);

  // Nothing stored yet: investment accounts start switched off.
  const excluded = useMemo(
    () => stored ?? accounts.filter((a) => a.type === 'investment').map((a) => a.id),
    [stored, accounts],
  );
  const excludeKey = groupId ? '' : excluded.join(',');
  // Nothing stored and accounts not loaded yet: the default exclusion is unknown, so do not fetch.
  const ready = groupId !== undefined || stored !== null || accounts.length > 0;
  const requestId = useRef(0);

  const range = useMemo(() => periodRange(preset, new Date(), custom), [preset, custom]);

  const load = useCallback(async () => {
    const id = ++requestId.current; // before the ready check: an in-flight response must not land late
    setLoading(true);
    setFailed(false);
    if (!ready) {
      // The default exclusion needs the account list. Load it ourselves; once it arrives `ready`
      // flips and this effect re-runs. No accounts after the attempt is a failure, never an empty result.
      await useAccountStore.getState().loadAccountsFromServer();
      if (id !== requestId.current) return;
      if (useAccountStore.getState().accounts.length === 0) {
        setData(null);
        setFailed(true);
        setLoading(false);
      }
      return;
    }
    try {
      const res = groupId
        ? await api.getGroupAnalytics(groupId, range.start, range.end)
        : await api.getAllAccountsAnalytics(range.start, range.end, excluded);
      if (id === requestId.current) setData(res);
    } catch (err) {
      if (id !== requestId.current) return; // superseded by a newer request
      // Expected offline; never console.error (LogBox shows it as a crash).
      console.warn('All-accounts analytics unavailable', err);
      setData(null); // never keep the previous period's figures under a failure
      setFailed(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, range.start, range.end, excludeKey, ready]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleAccount = useCallback(
    (accountId: string, include: boolean) => {
      if (groupId) return; // a group's membership is fixed; edit the group instead
      const next = include ? excluded.filter((id) => id !== accountId) : [...new Set([...excluded, accountId])];
      setStored(next);
      if (userId) writeExcluded(userId, next);
    },
    [groupId, excluded, userId],
  );

  return { data, failed, loading, reload: load, preset, setPreset, custom, setCustom, toggleAccount, excluded, range };
}
