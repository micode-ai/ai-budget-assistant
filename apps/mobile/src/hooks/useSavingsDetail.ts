import { useCallback, useState } from 'react';
import { api } from '@/services/api';
import type { SavingsKind, SavingsSummaryResponse } from '@budget/shared-types';

/**
 * Owns the fetch behind the "Discount savings"/"Deposits paid" drill-down
 * sheet opened from Quick Insights (`SavingsDetailSheet.tsx`). Not persisted
 * (no MMKV/Zustand store) — this is a one-off drill-down fetch, the same
 * category as `openDrillDown`/`DrillDownDialog`, not an offline-first feature:
 * the number it explains is itself a live, period-scoped server read, so
 * there is nothing useful to show offline that isn't already on screen as
 * the plain stat row.
 *
 * A fetch failure leaves `data: null` — the sheet then renders nothing extra
 * beyond a close button, mirroring `SafeToSpendSheet`'s own
 * `if (!data) return null` for the "no data yet" case.
 */
export function useSavingsDetail() {
  const [kind, setKind] = useState<SavingsKind | null>(null);
  const [data, setData] = useState<SavingsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const open = useCallback((nextKind: SavingsKind, startDate: string, endDate: string) => {
    setKind(nextKind);
    setData(null);
    setLoading(true);
    api
      .getSavingsDetail(nextKind, startDate, endDate)
      .then((res) => setData(res))
      .catch((err) => {
        console.warn('[useSavingsDetail] fetch failed', err);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const close = useCallback(() => {
    setKind(null);
    setData(null);
  }, []);

  return { kind, data, loading, open, close };
}
