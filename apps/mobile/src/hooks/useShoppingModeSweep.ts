import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
// This import is an ordinary one: it names the two functions it uses and
// nothing more.
//
// It is NOT what registers the location task, and must not be relied on for
// that. `TaskManager.defineTask` runs at module scope in
// `@/services/shoppingMode`, and the module that has to reach it is
// `apps/mobile/index.js` — the real entry — because a headless wake never
// evaluates a route module: Expo Router loads routes through
// `require.context`, whose Metro template puts every entry behind a lazy
// getter, and on a headless wake `ExpoRoot` never renders to read one. This
// hook is reached from `app/_layout.tsx`, which is a route module, so an
// executor registered only from here would be missing in exactly the case it
// exists for — and expo-task-manager responds to a task waking with no
// executor by calling `unregisterTaskAsync`, permanently killing the session.
// See the comment block in `index.js` for the full sequence.
import { sweepStaleShoppingMode, stopShoppingMode } from '@/services/shoppingMode';
import { useShoppingModeStore, readSession } from '@/stores/shoppingModeStore';
import { useAccountStore } from '@/stores/accountStore';

/**
 * Ends a session that outlived its two-hour cap, a service left running with
 * no session behind it, and a session belonging to an account the user has
 * since switched away from.
 *
 * Runs at app start AND on every foreground transition. `killServiceOnDestroy:
 * false` means the service survives the app being swiped away, so without this
 * a crash between starting a session and the next position update would strand
 * a foreground service — and its notification — indefinitely.
 *
 * Also the moment the UI learns what the location task did while the app was
 * closed, since the task writes MMKV and cannot touch a store.
 */
export function useShoppingModeSweep(): void {
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const swept = useRef(false);
  // The two entry points below can overlap — background/foreground flapping
  // fires `active` repeatedly — and `sweepStaleShoppingMode` awaits a native
  // registration read in the middle. One at a time.
  const sweeping = useRef(false);

  const runSweep = useCallback(() => {
    if (sweeping.current) return;
    sweeping.current = true;
    void sweepStaleShoppingMode(Date.now()).finally(() => {
      sweeping.current = false;
      useShoppingModeStore.getState().refreshFromDisk();
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (swept.current) return;
    swept.current = true;
    runSweep();
  }, [runSweep]);

  // The two-hour cap is NOT self-enforcing, and this is what bounds it.
  //
  // The cap lives inside `reduceShoppingSession`, which only ever runs on a
  // location callback — and the request carries `distanceInterval: 50`, which
  // maps to `setMinUpdateDistanceMeters(50f)`: a phone that does not move
  // delivers nothing, whatever the time interval says. So a user who presses
  // the button, changes their mind and presses Home (not swipe) keeps React
  // mounted, never moves 50 m, and the mount sweep above — once per mount,
  // guarded by `swept` — never runs again. Resuming a SINGLE_TOP Activity does
  // not remount. Without this listener the service and its notification simply
  // stay up.
  //
  // `swept` is deliberately not consulted here: it exists so a remount is a
  // no-op, and a genuine foreground transition is not a remount. `AppState`
  // fires only on real changes, so this adds no work at startup.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s !== 'active') return;
      runSweep();
    });
    return () => sub.remove();
  }, [runSweep]);

  // A session's snapshot — its shops, its list, its spend figure — belongs to
  // the account that started it. Switching accounts would otherwise leave it
  // running and notify about another account's shopping list, the same class
  // of bug as the Store Arrival widget's `currentAccountId` dependency. Ending
  // it is cheaper and more honest than trying to re-snapshot mid-trip.
  //
  // The `!currentAccountId` early return is deliberate and must stay a SKIP,
  // never a stop: null is also the normal pre-hydration state on every cold
  // start, before `loadAccounts()` has resolved, so treating it as "no account
  // owns this session" would kill a live session on every app launch. Signing
  // out — the other way `currentAccountId` becomes null — is handled where it
  // is unambiguous, in `authStore.logout()`.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!currentAccountId) return;
    const session = readSession();
    if (!session || session.snapshot.accountId === currentAccountId) return;
    void stopShoppingMode().finally(() => {
      useShoppingModeStore.getState().refreshFromDisk();
    });
  }, [currentAccountId]);
}
