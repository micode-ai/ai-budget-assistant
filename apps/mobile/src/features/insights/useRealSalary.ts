import { useCallback, useState } from 'react';
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
    setLoading(true);
    setError(false);
    try {
      setData(await api.getRealSalary());
    } catch (e) {
      console.warn('Failed to load real salary', e);
      setError(true);
    } finally {
      setLoading(false);
    }
    // currentAccountId: a switch must refetch (X-Account-Id changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccountId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { data, loading, error, reload: load };
}
