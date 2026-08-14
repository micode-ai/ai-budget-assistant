import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
// This import is load-bearing beyond the two functions it names. Importing
// `@/services/shoppingMode` is what runs its module-scope
// `TaskManager.defineTask(SHOPPING_MODE_TASK, ...)`, and that call is the only
// thing standing between a session and its own destruction: when a location
// update wakes the app and expo-task-manager finds no executor registered for
// the task name, its event handler does not merely skip the update — it calls
// `unregisterTaskAsync(taskName)` (see the `else` branch in
// expo-task-manager's `TaskManager.js`), permanently killing a session in
// progress.
//
// So this must stay a static, top-level import reached from the root layout on
// every app start. Do NOT make it lazy — no `await import(...)` inside a button
// handler, no moving it behind the Android check below, no dropping it because
// "the screen imports the service anyway" (a route module is not guaranteed to
// have been evaluated on a headless wake).
import { sweepStaleShoppingMode, stopShoppingMode } from '@/services/shoppingMode';
import { useShoppingModeStore, readSession } from '@/stores/shoppingModeStore';
import { useAccountStore } from '@/stores/accountStore';

/**
 * Ends a session that outlived its two-hour cap, a service left running with
 * no session behind it, and a session belonging to an account the user has
 * since switched away from.
 *
 * Runs once per app start. `killServiceOnDestroy: false` means the service
 * survives the app being swiped away, so without this a crash between starting
 * a session and the next position update would strand a foreground service —
 * and its notification — indefinitely.
 *
 * Also the moment the UI learns what the location task did while the app was
 * closed, since the task writes MMKV and cannot touch a store.
 */
export function useShoppingModeSweep(): void {
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const swept = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (swept.current) return;
    swept.current = true;
    void sweepStaleShoppingMode(Date.now()).finally(() => {
      useShoppingModeStore.getState().refreshFromDisk();
    });
  }, []);

  // A session's snapshot — its shops, its list, its spend figure — belongs to
  // the account that started it. Switching accounts would otherwise leave it
  // running and notify about another account's shopping list, the same class
  // of bug as the Store Arrival widget's `currentAccountId` dependency. Ending
  // it is cheaper and more honest than trying to re-snapshot mid-trip.
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
