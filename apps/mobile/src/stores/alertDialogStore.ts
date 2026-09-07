import { create } from 'zustand';
import type { AlertButton } from 'react-native';

export interface PendingAlert {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

interface AlertDialogState {
  pending: PendingAlert | null;
  show: (alert: PendingAlert) => void;
  dismiss: () => void;
}

/**
 * Backs the web implementation of `showAlert` (`src/utils/alert.ts`), which
 * used to call `window.alert`/`window.confirm`. Deliberately NOT persisted and
 * deliberately holding only ONE pending alert: a native `Alert.alert` shows one
 * dialog at a time too, so a queue here would let web display something native
 * never would.
 *
 * Not to be confused with `alertStore`, which holds the server's anomaly alerts
 * — a different thing entirely that happens to share the word.
 */
export const useAlertDialogStore = create<AlertDialogState>((set) => ({
  pending: null,
  show: (alert) => set({ pending: alert }),
  dismiss: () => set({ pending: null }),
}));
