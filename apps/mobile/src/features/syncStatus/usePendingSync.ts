import { useCallback, useEffect, useState } from 'react';
import { loadPendingRows } from '@/db/pendingSyncRepository';
import {
  EMPTY_PENDING_SUMMARY,
  summarizePending,
  type PendingSyncSummary,
} from './pendingSyncSummary';

const REFRESH_MS = 30_000;

export function usePendingSync(): { summary: PendingSyncSummary; refresh: () => Promise<void> } {
  const [summary, setSummary] = useState<PendingSyncSummary>(EMPTY_PENDING_SUMMARY);

  const refresh = useCallback(async () => {
    try {
      setSummary(summarizePending(await loadPendingRows(), Date.now()));
    } catch (e) {
      // Expected on a cold DB or web; the chip just stays hidden.
      console.warn('Failed to read pending sync rows', e);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { summary, refresh };
}
