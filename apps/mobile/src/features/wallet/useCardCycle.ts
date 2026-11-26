import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardCycleSummary, UpsertCardCycleDto } from '@budget/shared-types';
import { api } from '@/services/api';

export type CardCycleStatus = 'loading' | 'error' | 'ready';

/**
 * Card-cycle setting of the current account. Online-only (the server computes the cycle sums).
 * A failed load is its own status, never `ready` with `summary: null`, so the screen cannot show
 * the "set up" prompt over an account that already has a card.
 */
export function useCardCycle(accountId: string | null) {
  const [status, setStatus] = useState<CardCycleStatus>('loading');
  const [summary, setSummary] = useState<CardCycleSummary | null>(null);
  const latest = useRef(accountId);
  latest.current = accountId;

  const load = useCallback(async () => {
    if (!accountId) return;
    setStatus('loading');
    setSummary(null);
    try {
      const rows = await api.getCardCycles();
      if (latest.current !== accountId) return;
      setSummary(rows[0] ?? null);
      setStatus('ready');
    } catch (e) {
      if (latest.current !== accountId) return;
      console.warn('Card cycle load failed:', e);
      setStatus('error');
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (dto: UpsertCardCycleDto) => {
    const next = await api.saveCardCycle(dto);
    setSummary(next);
    setStatus('ready');
  }, []);

  const remove = useCallback(async () => {
    await api.deleteCardCycle();
    setSummary(null);
    setStatus('ready');
  }, []);

  return { status, summary, reload: load, save, remove };
}
