import { useCallback, useEffect, useState } from 'react';
import type { Pet } from '@budget/shared-types';
import { api } from '@/services/api';
import { useAccountStore } from '@/stores/accountStore';

/**
 * Per-account cache of the pet list (ABA-831), so the transactions list's bulk
 * action and the Analytics card do not refetch it on every mount. Keyed by
 * account id — a switch or another user's sign-in reads its own key.
 */
const cache = new Map<string, Pet[]>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Refetch an account's list after a write and tell every mounted user. */
export async function reloadPets(accountId: string): Promise<void> {
  cache.set(accountId, await api.getPets());
  notify();
}

/**
 * The current account's pets. `refresh` reloads on mount (the settings
 * screen); without it a cached list is reused. A failed load is `loadFailed`,
 * never an empty list — offline there is no local copy.
 */
export function usePets({ refresh = false }: { refresh?: boolean } = {}) {
  const accountId = useAccountStore((s) => s.currentAccountId);
  const [, setTick] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [failedFor, setFailedFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    setIsLoading(true);
    try {
      cache.set(accountId, await api.getPets());
      setFailedFor(null);
      notify();
    } catch (err) {
      // Expected offline; never console.error (LogBox shows it as a crash).
      console.warn('Pets unavailable', err);
      setFailedFor(accountId);
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    const l = () => setTick((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!accountId) return;
    if (refresh || !cache.has(accountId)) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, refresh]);

  const pets = accountId ? cache.get(accountId) : undefined;
  return {
    accountId,
    pets: pets ?? [],
    isLoaded: pets !== undefined,
    isLoading,
    loadFailed: failedFor === accountId && pets === undefined,
    reload: load,
  };
}
