import { useCallback, useEffect, useState } from 'react';
import { api } from '@/services/api';
import type { WrappedResponse } from '@budget/shared-types';

export interface UseWrappedResult {
  data: WrappedResponse | null;
  loading: boolean;
  error: boolean;
  reload: () => void;
}

/**
 * Loads the year-in-review "Wrapped" deck from the server.
 * Server-only + historical (no MMKV cache) — it's a rarely-opened, always-fresh screen.
 * Zero AI cost; the server assembles it from existing data.
 */
export function useWrapped(year?: number): UseWrappedResult {
  const [data, setData] = useState<WrappedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.getWrapped(year);
      setData(res);
    } catch (e) {
      console.warn('Failed to load wrapped', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
