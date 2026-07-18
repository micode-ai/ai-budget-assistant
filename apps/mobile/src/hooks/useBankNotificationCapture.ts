import { useEffect } from 'react';
import { Platform } from 'react-native';
import {
  subscribeToCapture,
  unsubscribeFromCapture,
} from '@/services/notificationCapture/captureService';
import { isEnabled as isCaptureEnabled } from '@/services/notificationCapture';

/**
 * Subscribes to bank-notification capture events as early as possible on
 * Android. Previously gated on isAuthenticated+fontsLoaded+!isInitializing,
 * which caused a startup race: a bank push that arrived during boot was
 * emitted by Kotlin before JS registered its listener, and was silently
 * dropped. Now we subscribe on mount (empty deps). Safety: Kotlin's
 * onNotificationPosted checks the SharedPreferences flag FIRST, so no event
 * is forwarded unless the user explicitly enabled capture.
 * handleBankNotification returns early gracefully when auth isn't ready yet.
 * iOS/web: subscribeToCapture() is a no-op (Platform.OS !== 'android' early-return).
 */
export function useBankNotificationCapture(): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    let active = true;
    isCaptureEnabled().then((enabled) => {
      if (enabled && active) subscribeToCapture();
    }).catch(() => {});

    return () => {
      active = false;
      unsubscribeFromCapture();
    };
  }, []);
}
