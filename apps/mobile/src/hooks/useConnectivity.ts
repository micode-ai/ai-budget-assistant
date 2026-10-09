import { useEffect } from 'react';
import { ensureConnectivityListeners, useConnectivityStore } from '@/services/connectivity';

/** `unknown` counts as online: nothing is disabled before the first answer. */
export function useConnectivity(): { isOffline: boolean } {
  const status = useConnectivityStore((s) => s.status);
  useEffect(() => {
    ensureConnectivityListeners();
  }, []);
  return { isOffline: status === 'offline' };
}
