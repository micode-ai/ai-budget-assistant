import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { RealSalaryResponse } from '@budget/shared-types';
import { api } from '@/services/api';
import { useAccountStore } from '@/stores/accountStore';

export interface UseRealSalaryResult {
  data: RealSalaryResponse | null;
  loading: boolean;
  error: boolean;
  reload: () => void;
}

/** Online-only by design: the answer is computed server-side and cached there. */
export function useRealSalary(): UseRealSalaryResult {
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const [data, setData] = useState<RealSalaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    // Capture the account at request time. If it changes while the request is
    // in flight, ignore the response — it belongs to a previous account.
    const accountId = useAccountStore.getState().currentAccountId;

    setLoading(true);
    setError(false);
    try {
      const response = await api.getRealSalary();
      // The account can change while the request is in flight — and the header
      // is read from the getter mid-request (after the `await getAuthToken()`),
      // so a switch at any point during the call means we cannot prove which
      // account answered. Attribute only when the account held still across the
      // whole request; otherwise leave state to the newer load the switch
      // already triggered.
      if (useAccountStore.getState().currentAccountId !== accountId) return;
      setData(response);
    } catch (e) {
      if (useAccountStore.getState().currentAccountId !== accountId) return;
      console.warn('Failed to load real salary', e);
      setError(true);
    } finally {
      // Only clear loading if the account hasn't changed.
      if (useAccountStore.getState().currentAccountId === accountId) {
        setLoading(false);
      }
    }
    // currentAccountId: a switch must refetch (X-Account-Id changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccountId]);

  // Clear data immediately when the account changes, before the new load fires.
  useEffect(() => {
    setData(null);
  }, [currentAccountId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { data, loading, error, reload: load };
}
