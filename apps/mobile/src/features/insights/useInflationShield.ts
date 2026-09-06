import { useEffect } from 'react';
import type { InflationShieldResponse } from '@budget/shared-types';
import { useInflationShieldStore } from '@/stores/inflationShieldStore';
import { useAccountStore } from '@/stores/accountStore';

export interface UseInflationShieldResult {
  data: InflationShieldResponse | null;
  loading: boolean;
  hasEnoughData: boolean;
}

export function useInflationShield(): UseInflationShieldResult {
  const data = useInflationShieldStore((s) => s.data);
  const loading = useInflationShieldStore((s) => s.loading);
  const load = useInflationShieldStore((s) => s.load);
  const currentAccountId = useAccountStore((s) => s.currentAccountId);

  // Load on mount AND on every account change. `currentAccountId` is
  // load-bearing twice, for two different failures — the same pair documented
  // on `useSafeToSpend`:
  //
  //  - Cold start. This effect used to depend only on `load` (a stable zustand
  //    action), so it fired while `currentAccountId` was still null and the
  //    request went out with no `X-Account-Id` header. The store now refuses to
  //    issue that request; this dependency is what re-issues it, correctly
  //    addressed, once the account is known.
  //  - Account switch. Nothing re-fired this at all, so the widget and the
  //    `/inflation-shield` screen kept the previous account's figures for as
  //    long as they stayed mounted. No guard inside the store can fix that: a
  //    guard suppresses a wrong request, it never triggers the right one.
  useEffect(() => {
    load();
  }, [load, currentAccountId]);

  return {
    data,
    loading,
    hasEnoughData: !!data?.hasEnoughData,
  };
}
