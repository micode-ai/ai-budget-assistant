import { useEffect, useRef } from 'react';
import { useNavigationContainerRef } from 'expo-router';
import { startTelemetrySession, trackScreen } from '@/services/telemetry';
import { useAuthStore } from '@/stores/authStore';

/**
 * Reports a screen view per navigation, observed through the navigation ref's
 * listener so the host component never re-renders — the only shape allowed near
 * `RootNavigator` (`usePathname()` there re-rendered every `<Stack.Screen>`).
 *
 * One file for every platform: the hook only decides WHEN to report, and
 * `services/telemetry` resolves to the web or the native implementation (the
 * same listener shape `useClientErrorReporting` already runs on native). The
 * gate is the signed-in cold-start gate, so nothing is reported before login;
 * the "Share usage statistics" switch is honoured inside the service.
 *
 * The reported name is the ROUTE PATTERN from `getCurrentRoute().name`
 * (`expense/[id]`), never the resolved path, which would put an expense id into
 * a telemetry row.
 */
export function useTelemetryScreenViews(gateOpen: boolean): void {
  const navigationRef = useNavigationContainerRef();
  const started = useRef(false);
  const lastScreen = useRef<string | null>(null);

  useEffect(() => {
    if (!gateOpen) {
      // A sign-out closes the gate and `resetTelemetry()` mints a fresh
      // sessionId, so the next gate-open is a NEW session and must get its own
      // session_start. These refs live on RootNavigator, which is never
      // unmounted, so without this reset a sign-in after a sign-out in the same
      // app load would report screens under a session id that has no start —
      // and would swallow the first screen view whenever it happens to match
      // the screen showing before sign-out.
      started.current = false;
      lastScreen.current = null;
      return;
    }

    if (!started.current) {
      started.current = true;
      // The user id makes the native queue's owner: a backlog recorded for
      // anyone else is cleared rather than sent under this user's token.
      startTelemetrySession(useAuthStore.getState().user?.id);
    }

    const report = () => {
      const name = navigationRef.getCurrentRoute()?.name;
      if (!name || name === lastScreen.current) return;
      lastScreen.current = name;
      trackScreen(name);
    };

    report();
    const unsubscribe = navigationRef.addListener('state', report);
    return unsubscribe;
  }, [gateOpen, navigationRef]);
}
