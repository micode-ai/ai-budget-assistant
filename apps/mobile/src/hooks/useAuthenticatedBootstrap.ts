import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { seedLegacyThemeFromLocal } from '@/stores/themeStore';
import { registerForPushNotifications } from '@/services/notifications';
import { api } from '@/services/api';
import i18n from '@/i18n';
import { registerRestoreCredential } from '@/features/auth/restoreCredential';
import { restoreCredentialFlag } from '@/stores/restoreCredentialStore';
import { acquisitionFlag } from '@/stores/acquisitionStore';
import { getAcquisition } from '@/services/attribution';

/** Not exported: nothing outside this file references it. Kept as a named
 * constant purely so the `setTimeout` call below reads as "the bootstrap
 * delay", not a bare magic number. */
const AUTHENTICATED_BOOTSTRAP_DELAY_MS = 1500;

/**
 * The delayed half of the bootstrap — push registration, language sync, the
 * restore-credential re-check (ABA-465), and the install-referrer acquisition
 * backfill (ABA-553). Deliberately a plain, exported
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
 *
 * Also backfills the install-referrer acquisition data (ABA-553) for the same
 * reason — a fresh registration already carries it in the request body, but
 * an already-signed-in user never registers again. `acquisitionFlag.hasPushed()`
 * is deliberately per-INSTALL (one MMKV flag for the device), unlike
 * `restoreCredentialFlag.hasSynced(userId)` right above it, which is
 * per-USER: attribution belongs to the install that captured the Play
 * referrer, not to whichever account happens to be signed in, so a second
 * account signing in on the same device correctly never re-backfills its own
 * (nonexistent) copy of this install's referrer.
 */
export function runDelayedAuthenticatedBootstrap(): void {
  registerForPushNotifications();
  api.updateProfile({ language: i18n.language }).catch(() => {});
  const userId = useAuthStore.getState().user?.id;
  if (userId && !restoreCredentialFlag.hasSynced(userId)) {
    void registerRestoreCredential(userId);
  }

  // Late attribution for users who registered before install-referrer capture shipped.
  // A new registration already carries this in its own request body, so for everyone
  // else this is a single no-op PATCH the server refuses via its first-touch guard.
  //
  // Gated on `referrerRaw`, not just any truthy `acquisition` — `getAcquisition()` is
  // platform-resolved, and on web a stored value is a `src`/`loc`/`lang`/`plan` record
  // written on the FIRST param-carrying visit, with no timestamp. Backfilling from that
  // would let a user who registered months ago via a param-less visit get retroactively
  // labelled by whatever channel they happened to click today — biased toward whatever
  // we promote most, i.e. exactly the channels this feature exists to measure. Only the
  // native path ever sets `referrerRaw` (see `attribution.native.ts`'s `captureAcquisition`),
  // and only from Play's own Install Referrer for THIS install, so it is real evidence
  // rather than a browsing-session artifact.
  if (!acquisitionFlag.hasPushed()) {
    const acquisition = getAcquisition();
    if (acquisition?.referrerRaw) {
      api
        .updateAcquisition(acquisition)
        .then(() => acquisitionFlag.markPushed())
        .catch((e) => console.warn('[Attribution] acquisition backfill failed:', e));
    }
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
