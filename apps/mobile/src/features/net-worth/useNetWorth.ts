import { useCallback, useEffect, useState } from 'react';
import { MMKV } from 'react-native-mmkv';
import type { NetWorthResponse } from '@budget/shared-types';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';

const storage = new MMKV({ id: 'net-worth' });

/** The accounts this user switched off, stored on the device (ABA-799). */
function readExcluded(userId: string): string[] {
  try {
    const raw = storage.getString(`excluded:${userId}`);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeExcluded(userId: string, ids: string[]) {
  try {
    storage.set(`excluded:${userId}`, JSON.stringify(ids));
  } catch {
    // A device without storage just forgets the choice; the figure is still right.
  }
}

/**
 * Net worth across all the user's accounts, with the device-stored exclusion
 * list. `failed` is a load error — never shown as a zero net worth.
 */
export function useNetWorth() {
  const userId = useAuthStore((s) => s.user?.id);
  const [excluded, setExcluded] = useState<string[]>(() => (userId ? readExcluded(userId) : []));
  const [data, setData] = useState<NetWorthResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setData(await api.getNetWorth(excluded));
    } catch (err) {
      // Expected offline; never console.error (LogBox shows it as a crash).
      console.warn('Net worth unavailable', err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [excluded]);

  useEffect(() => {
    if (userId) setExcluded(readExcluded(userId));
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleAccount = useCallback(
    (accountId: string, include: boolean) => {
      setExcluded((prev) => {
        const next = include ? prev.filter((id) => id !== accountId) : [...new Set([...prev, accountId])];
        if (userId) writeExcluded(userId, next);
        return next;
      });
    },
    [userId],
  );

  return { data, failed, loading, reload: load, toggleAccount };
}
