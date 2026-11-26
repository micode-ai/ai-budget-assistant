import { useCallback, useEffect, useRef, useState } from 'react';
import type { MerchantSpendingCap, UpsertMerchantCapDto } from '@budget/shared-types';
import { api } from '@/services/api';

export type MerchantCapsStatus = 'loading' | 'error' | 'ready';

/** Merchant caps of the current account. Online-only; a failed load is its own status, never an empty `ready`. */
export function useMerchantCaps(accountId: string | null) {
  const [status, setStatus] = useState<MerchantCapsStatus>('loading');
  const [caps, setCaps] = useState<MerchantSpendingCap[]>([]);
  const latest = useRef(accountId);
  latest.current = accountId;

  const load = useCallback(async () => {
    if (!accountId) return;
    setStatus('loading');
    setCaps([]);
    try {
      const rows = await api.getMerchantCaps();
      if (latest.current !== accountId) return;
      setCaps(rows);
      setStatus('ready');
    } catch (e) {
      if (latest.current !== accountId) return;
      console.warn('Merchant caps load failed:', e);
      setStatus('error');
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (dto: UpsertMerchantCapDto) => {
    const next = await api.saveMerchantCap(dto);
    setCaps((prev) => [...prev.filter((c) => c.id !== next.id), next].sort((a, b) => a.merchantNormalized.localeCompare(b.merchantNormalized)));
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.deleteMerchantCap(id);
    setCaps((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { status, caps, reload: load, save, remove };
}
