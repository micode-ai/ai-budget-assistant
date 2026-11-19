import { useCallback, useEffect, useReducer, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAccountStore } from '@/stores/accountStore';
import type { AccountListCache } from '@/utils/accountListCache';

/** One fetch per cache and account at a time: several mounted readers share it. */
const inFlight = new WeakMap<object, Map<string, Promise<unknown[]>>>();
function fetchOnce<T>(cache: AccountListCache<T>, accountId: string, fetchList: () => Promise<T[]>): Promise<T[]> {
  let byAccount = inFlight.get(cache);
  if (!byAccount) inFlight.set(cache, (byAccount = new Map()));
  const pending = byAccount.get(accountId) as Promise<T[]> | undefined;
  if (pending) return pending;
  const p = fetchList().finally(() => byAccount!.delete(accountId));
  byAccount.set(accountId, p);
  return p;
}

/**
 * The current account's copy of one online-only list held in an
 * `AccountListCache` (pets, vehicles; ABA-833). Every mounted reader re-renders
 * on any write to the cache, and a stale or missing entry is refetched on mount
 * and whenever the screen regains focus, so a tab that stays mounted (the
 * transactions list) still learns about a pet added elsewhere. `refresh`
 * forces a fetch on mount (the settings screens). A failed load is
 * `loadFailed`, never an empty list — offline there is no local copy.
 */
export function useAccountList<T>(
  cache: AccountListCache<T>,
  fetchList: () => Promise<T[]>,
  { refresh = false, label }: { refresh?: boolean; label: string },
) {
  const accountId = useAccountStore((s) => s.currentAccountId);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [isLoading, setIsLoading] = useState(false);
  const [failedFor, setFailedFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    setIsLoading(true);
    try {
      cache.set(accountId, await fetchOnce(cache, accountId, fetchList));
      setFailedFor(null);
    } catch (err) {
      // Expected offline; never console.error (LogBox shows it as a crash).
      console.warn(`${label} unavailable`, err);
      setFailedFor(accountId);
    } finally {
      setIsLoading(false);
    }
    // fetchList is a module-level API method; the cache is a module singleton.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useEffect(() => cache.subscribe(rerender), [cache]);

  useEffect(() => {
    if (!accountId) return;
    if (refresh || cache.isStale(accountId)) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, refresh]);

  useFocusEffect(
    useCallback(() => {
      if (accountId && cache.isStale(accountId)) void load();
    }, [accountId, cache, load]),
  );

  const list = accountId ? cache.get(accountId) : undefined;
  return {
    accountId,
    list: list ?? [],
    isLoaded: list !== undefined,
    isLoading,
    loadFailed: failedFor === accountId && list === undefined,
    reload: load,
  };
}
