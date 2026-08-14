import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import i18n from '@/i18n';
import { formatCurrency } from '@budget/shared-utils';
import { reduceShoppingSession, SHOPPING_MODE_DEFAULTS } from '@/features/shopping-mode/session';
import type { SessionSnapshot } from '@/features/shopping-mode/snapshot';
import { readSession, writeSession, clearSession } from '@/stores/shoppingModeStore';

export const SHOPPING_MODE_TASK = 'shopping-mode-location';

/**
 * Post a local notification.
 *
 * `presentNotificationAsync` no longer exists in expo-notifications 0.32 — a
 * null trigger is how an immediate local notification is sent now.
 *
 * The language is not a parameter here: every caller resolves its own strings
 * through `i18n.t(..., { lng })` using the language frozen in the snapshot,
 * because on a headless wake nothing has told i18next which language the user
 * reads.
 */
async function notify(title: string, body: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { type: 'shopping_mode' } },
      trigger: null,
    });
  } catch (e) {
    // A failed notification must never take the service down with it. There is
    // no UI to surface this in and no user to report it to — the session is
    // already correct on disk by the time we get here, so swallowing this
    // costs one missed notification and nothing else.
    console.warn('[ShoppingMode] notification failed:', e);
  }
}

function arrivalText(snapshot: SessionSnapshot, merchant: string): { title: string; body: string } {
  const lng = snapshot.language;
  const title = i18n.t('shoppingMode.arrivalTitle', { lng, merchant });
  const count = snapshot.uncheckedCount;
  if (snapshot.safeToSpendToday === null || !snapshot.currencyCode) {
    return { title, body: i18n.t('shoppingMode.arrivalBodyNoSpend', { lng, count }) };
  }
  const amount = formatCurrency(snapshot.safeToSpendToday, snapshot.currencyCode);
  return { title, body: i18n.t('shoppingMode.arrivalBody', { lng, count, amount }) };
}

function exitText(snapshot: SessionSnapshot, merchant: string): { title: string; body: string } {
  const lng = snapshot.language;
  return {
    title: i18n.t('shoppingMode.exitTitle', { lng, merchant }),
    body: i18n.t('shoppingMode.exitBody', { lng, count: snapshot.uncheckedCount }),
  };
}

// A throw inside this executor cannot take the service down: expo-task-manager
// wraps every invocation in its own try/catch and still calls
// `notifyTaskFinishedAsync` from a `finally` (TaskManager.js:140-148). So the
// worst a malformed native payload can do here is log and skip one update.
TaskManager.defineTask(SHOPPING_MODE_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[ShoppingMode] task error:', error);
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  const last = locations?.[locations.length - 1];
  if (!last) return;

  // Everything below reads MMKV and pure functions only. No store, no network,
  // no hook — this may be a headless JS context with nothing else initialised.
  const session = readSession();
  if (!session) {
    // No session on disk but the task is running: either a leftover from a
    // killed process, or a row this build could not parse. Tear it down rather
    // than notify about a session nobody started — an unreadable session is
    // treated as no session, and stopping is the safe end state.
    await stopShoppingMode();
    return;
  }

  const result = reduceShoppingSession({
    session: { startedAt: session.startedAt, insideMerchant: session.insideMerchant },
    centres: session.snapshot.centres,
    coords: { lat: last.coords.latitude, lng: last.coords.longitude },
    now: Date.now(),
    hasUncheckedItems: session.snapshot.uncheckedCount > 0,
  });

  // ---------------------------------------------------------------------
  // Persist FIRST, synchronously, before anything at all is awaited.
  //
  // `reduceShoppingSession` is a pure function of position and time: on exit
  // it returns the session unchanged, and on arrival the caller is what turns
  // its new state into a stored fact. Neither notification is exactly-once
  // unless the store is updated before we yield.
  //
  // The window is real, not theoretical. `await` hands control back to the
  // event loop, a location update already queued natively re-enters this
  // executor, `readSession()` still reports the old state, and the reducer
  // reaches the same conclusion a second time: "you're at Biedronka" twice on
  // arrival, or "you're leaving Biedronka" twice on the way out. Tearing the
  // service down at the end of the function is far too late — `killServiceOnDestroy: false`
  // keeps this service alive across the app being swiped away, so there is
  // plenty of time for a queued update to land.
  //
  // With the session already cleared, that re-entrant update finds no session
  // and takes the teardown branch above silently.
  // ---------------------------------------------------------------------
  if (result.stop) {
    clearSession();
  } else if (result.session.insideMerchant !== session.insideMerchant) {
    writeSession({ ...session, insideMerchant: result.session.insideMerchant });
  }

  if (result.notify?.kind === 'arrival') {
    const { title, body } = arrivalText(session.snapshot, result.notify.merchant);
    await notify(title, body);
  } else if (result.notify?.kind === 'exit') {
    const { title, body } = exitText(session.snapshot, result.notify.merchant);
    await notify(title, body);
  }

  if (result.stop) {
    await stopShoppingMode();
  }
});

/**
 * Begin a session. Returns `'no_permission'` without leaving anything running
 * if the session could not be started.
 *
 * Foreground location only — `requestForegroundPermissionsAsync`, never
 * `requestBackgroundPermissionsAsync`. A foreground service of type `location`
 * is exempt from ACCESS_BACKGROUND_LOCATION, and keeping it that way is the
 * entire reason this design exists.
 *
 * Deliberately NOT gated on the Settings → Data location toggle that governs
 * the passive Store Arrival card. Pressing the button is explicit, scoped,
 * per-session consent with a persistent notification visible throughout — a
 * stronger signal than the toggle. Requiring the toggle as well would refuse
 * the feature to exactly the user who wants an explicit mode rather than
 * continuous tracking. Do not add that gate.
 */
export async function startShoppingMode(
  snapshot: SessionSnapshot,
): Promise<'started' | 'no_permission'> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return 'no_permission';
  } catch (e) {
    // Asking can itself fail where the module is unavailable. Nothing has been
    // written or started at this point, so returning is enough — but it must
    // return rather than reject, or a UI button handler gets an unhandled
    // rejection instead of the one branch it knows how to render.
    console.warn('[ShoppingMode] location permission request failed:', e);
    return 'no_permission';
  }

  // Never two sessions at once: stop whatever is running before starting.
  await stopShoppingMode();

  writeSession({ startedAt: Date.now(), insideMerchant: null, snapshot });

  try {
    await Location.startLocationUpdatesAsync(SHOPPING_MODE_TASK, {
      accuracy: Location.Accuracy.Balanced,
      // Let the OS coalesce updates: we care about ~150 m, not about metres.
      distanceInterval: 50,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: i18n.t('shoppingMode.serviceTitle', { lng: snapshot.language }),
        notificationBody: i18n.t('shoppingMode.serviceBody', { lng: snapshot.language }),
        // False on purpose: the whole point is that this survives the app being
        // swiped away. The 2-hour cap and the stale sweep are what bound it.
        killServiceOnDestroy: false,
      },
    });
  } catch (e) {
    // The session was written a moment ago on the assumption this would start.
    // If it did not — no foreground location service on this platform (web,
    // and iOS, which has no native project in this repo), the OS refusing to
    // start a foreground service, a revoked permission between the check and
    // here — that row must not survive, or the UI shows shopping mode as
    // running for up to the 2-hour cap with nothing behind it.
    //
    // Reported as `'no_permission'` because the union has no third member and
    // this is the branch a caller must take either way: we could not start
    // watching the user's location.
    console.warn('[ShoppingMode] failed to start location updates:', e);
    clearSession();
    return 'no_permission';
  }

  return 'started';
}

export async function stopShoppingMode(): Promise<void> {
  clearSession();
  try {
    if (await TaskManager.isTaskRegisteredAsync(SHOPPING_MODE_TASK)) {
      await Location.stopLocationUpdatesAsync(SHOPPING_MODE_TASK);
    }
  } catch (e) {
    // Clearing the session is what the UI reads, and it has already happened.
    // A failure here (unavailable on this platform, service already gone)
    // leaves at worst an orphan service that the next sweep retries.
    console.warn('[ShoppingMode] failed to stop location updates:', e);
  }
}

/**
 * Stop a session that outlived its cap, and stop a service running with no
 * session behind it.
 *
 * This is not belt-and-braces. `killServiceOnDestroy: false` keeps the service
 * alive across the app being swiped away, and since Android 13 a user can
 * dismiss the persistent notification without stopping anything — so for a
 * user who has dismissed it, this sweep and the in-app stop button are the only
 * two ways the service ever ends.
 */
export async function sweepStaleShoppingMode(now: number): Promise<void> {
  const session = readSession();
  const registered = await TaskManager.isTaskRegisteredAsync(SHOPPING_MODE_TASK).catch(() => false);

  if (!session) {
    if (registered) await stopShoppingMode();
    return;
  }
  if (now - session.startedAt > SHOPPING_MODE_DEFAULTS.sessionMaxMs) {
    await stopShoppingMode();
  }
}
