import { useEffect } from 'react';
import { AppState } from 'react-native';
import { ensureConnectivityListeners, useConnectivityStore } from '@/services/connectivity';
import { useWalletStore } from '@/stores/walletStore';
import { createTransferQueueFlusher } from '@/features/wallet/transferQueueFlusher';

/**
 * Drains the offline account-transfer queue when connectivity returns or the app
 * comes back to the foreground, instead of waiting for the next wallet screen load.
 * Only the trigger is new; the queue and its idempotency live in
 * `syncPendingTransfersAction`.
 */
export function useTransferQueueAutoFlush(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    ensureConnectivityListeners();
    const flusher = createTransferQueueFlusher({
      flush: () => useWalletStore.getState().syncPendingTransfers(),
      now: () => Date.now(),
    });

    const unsubscribe = useConnectivityStore.subscribe((state, prev) => {
      if (state.status === 'online' && prev.status === 'offline') void flusher.request();
    });
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') void flusher.request();
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [enabled]);
}
