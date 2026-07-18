import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  setupNotificationListeners,
  handleNotificationResponse,
} from '@/services/notifications';

/**
 * Owns the cold-start push-notification deep link: sets up the foreground/
 * background notification listeners and captures + flushes a notification
 * response that cold-started the app (tapped while the app was killed).
 *
 * `coldStartGateReady` (from `useColdStartGate`) is the shared "app is fully
 * ready" gate — see the "keep the two deep-link paths gated symmetrically"
 * invariant, shared with `useTripInviteDeepLink`.
 */
export function useNotificationDeepLink(coldStartGateReady: boolean): void {
  // A notification that cold-started the app (tapped while the app was
  // killed). It must NOT be acted on until the navigation tree is mounted
  // and the auth/account context is loaded — see the deferred-flush effect
  // below.
  const [pendingNotification, setPendingNotification] =
    useState<Notifications.NotificationResponse | null>(null);

  // Set up notification listeners
  useEffect(() => {
    const cleanup = setupNotificationListeners();

    // Capture the notification that launched the app (cold start) — native only;
    // expo-notifications throws "not available on web" otherwise. We only STORE it
    // here; navigating now would target an unmounted <Stack> (RootNavigator still
    // returns null while initializing) and switchAccount() would no-op against the
    // not-yet-loaded accounts list, wedging the app on a blank screen.
    if (Platform.OS !== 'web') {
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) {
          setPendingNotification(response);
        }
      }).catch(() => {});
    }

    return cleanup;
  }, []);

  // Flush a cold-start notification deep-link once the app is fully ready, the
  // same gate the Linking trip-invite deep-link handler uses. Depending on
  // which settles last (init/auth vs the async getLastNotificationResponseAsync),
  // this effect re-runs and navigates exactly once.
  useEffect(() => {
    if (!coldStartGateReady || !pendingNotification) return;
    handleNotificationResponse(pendingNotification);
    setPendingNotification(null);
  }, [coldStartGateReady, pendingNotification]);
}
