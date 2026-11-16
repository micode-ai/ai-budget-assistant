import { useCallback, useEffect, useState } from 'react';
import type { Vehicle } from '@budget/shared-types';
import { api } from '@/services/api';
import { useAccountStore } from '@/stores/accountStore';

/**
 * Per-account cache of the vehicle list, so the expense screen's fill-up
 * section does not refetch it on every expense opened. Keyed by account id —
 * a switch or another user's sign-in reads its own key, never this one's.
 */
const cache = new Map<string, Vehicle[]>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Refetch an account's list after a write and tell every mounted user. */
export async function reloadVehicles(accountId: string): Promise<void> {
  cache.set(accountId, await api.getVehicles());
  notify();
}

/**
 * The current account's vehicles (ABA-796). `refresh` reloads on mount (the
 * settings screen); without it a cached list is reused. A failed load is
 * `loadFailed`, never an empty list — offline there is no local copy.
 */
export function useVehicles({ refresh = false }: { refresh?: boolean } = {}) {
  const accountId = useAccountStore((s) => s.currentAccountId);
  const [, setTick] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [failedFor, setFailedFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    setIsLoading(true);
    try {
      cache.set(accountId, await api.getVehicles());
      setFailedFor(null);
      notify();
    } catch (err) {
      // Expected offline; never console.error (LogBox shows it as a crash).
      console.warn('Vehicles unavailable', err);
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

  const vehicles = accountId ? cache.get(accountId) : undefined;
  return {
    accountId,
    vehicles: vehicles ?? [],
    isLoaded: vehicles !== undefined,
    isLoading,
    loadFailed: failedFor === accountId && vehicles === undefined,
    reload: load,
  };
}
