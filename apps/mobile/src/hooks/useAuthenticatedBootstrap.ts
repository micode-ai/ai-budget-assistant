import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { seedLegacyThemeFromLocal } from '@/stores/themeStore';
import { registerForPushNotifications } from '@/services/notifications';
import { api } from '@/services/api';
import i18n from '@/i18n';
import { registerRestoreCredential } from '@/features/auth/restoreCredential';
import { restoreCredentialFlag } from '@/stores/restoreCredentialStore';

/** Not exported: nothing outside this file references it. Kept as a named
 * constant purely so the `setTimeout` call below reads as "the bootstrap
 * delay", not a bare magic number. */
const AUTHENTICATED_BOOTSTRAP_DELAY_MS = 1500;

/**
 * The delayed half of the bootstrap — push registration, language sync, and
 * the restore-credential re-check (ABA-465). Deliberately a plain, exported
 * function rather than inline in the `useEffect` below: it is what the
 * `setTimeout` callback IS, not a closure the effect happens to build, so a
 * test can call it directly, without needing to render the hook — this
 * codebase has no react-test-renderer / @testing-library/react-native
 * dependency (see CLAUDE.md's "Share image mechanism" note for the same
 * constraint on a different component). What the test in
 * `useAuthenticatedBootstrap.test.ts` actually pins is this function's own
 * contents — gated behind `hasSynced`, reading the user id from the auth
 * store rather than a parameter. It does NOT pin that this function is only
 * ever reached via the effect's `setTimeout` (an inlined direct call, or a
 * delay of `0`, would pass the same test) — that's a real gap, accepted
 * because rendering the hook to close it isn't available here.
 *
 * Registers this device's restore credential (ABA-465) for any user who
 * already has an active session and will never sign in again — sign-in
 * itself only reaches users who authenticate from now on, but
 * `JWT_EXPIRES_IN` is 7 days and the app restores its session from local
 * storage indefinitely, so without this the whole installed base would
 * silently never get a restore credential. Gated on `hasSynced` so this is a
 * cheap synchronous MMKV read on every launch, not a network call.
 */
export function runDelayedAuthenticatedBootstrap(): void {
  registerForPushNotifications();
  api.updateProfile({ language: i18n.language }).catch(() => {});
  const userId = useAuthStore.getState().user?.id;
  if (userId && !restoreCredentialFlag.hasSynced(userId)) {
    void registerRestoreCredential(userId);
  }
}

/**
 * Auth-triggered side effects — split out of the deep-link concerns because
 * these aren't about navigation, they're one-time setup that only makes
 * sense once a user is signed in:
 *
 * - Loads the subscription tier once, right after auth, so Pro-gates
 *   (shopping-list compare, Story/Fat-Finder/AI-Insights) don't
 *   false-paywall a paid user who reaches the feature before AiUsageBadge /
 *   the subscription screens have loaded it.
 * - Registers for push notifications, syncs the user's language to the
 *   server, and re-checks the restore credential — all delayed via
 *   `runDelayedAuthenticatedBootstrap` above, slightly, so the navigation
 *   stack settles before the OS permission dialog appears — avoids a crash
 *   on Android when the dialog dismisses into a partially-mounted screen.
 */
export function useAuthenticatedBootstrap(isAuthenticated: boolean): void {
  useEffect(() => {
    if (!isAuthenticated) return;
    void useSubscriptionStore.getState().loadSubscription();
    seedLegacyThemeFromLocal();
    const timer = setTimeout(runDelayedAuthenticatedBootstrap, AUTHENTICATED_BOOTSTRAP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isAuthenticated]);
}
