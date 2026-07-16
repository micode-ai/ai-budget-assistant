import { useEffect } from 'react';
import type { InflationShieldResponse } from '@budget/shared-types';
import { useInflationShieldStore } from '@/stores/inflationShieldStore';

export interface UseInflationShieldResult {
  data: InflationShieldResponse | null;
  loading: boolean;
  hasEnoughData: boolean;
}

export function useInflationShield(): UseInflationShieldResult {
  const data = useInflationShieldStore((s) => s.data);
  const loading = useInflationShieldStore((s) => s.loading);
  const load = useInflationShieldStore((s) => s.load);

  useEffect(() => {
    load();
  }, [load]);

  return {
    data,
    loading,
    hasEnoughData: !!data?.hasEnoughData,
  };
}
