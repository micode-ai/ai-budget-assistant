import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useShoppingListStore } from '@/stores/shoppingListStore';
import { refreshSessionItems } from '@/features/shopping-mode/refreshSessionItems';

/**
 * Keeps a running session's unchecked count and labels in step with the list
 * while the app is alive.
 *
 * The session snapshot is frozen at the moment the button is pressed, which is
 * right for the shop centres and the spend figure but wrong for the list: a
 * user who ticks all five items off during the trip would otherwise be told
 * "Still on your list: 5" on the way out. The shopping list can only be changed
 * from inside the app — screen, AI chat, restock and deal chips all write
 * through this one store — so an in-app subscription covers the case
 * completely. There is no closed-app case to handle.
 *
 * This is a plain store subscription inside an empty-deps effect, deliberately
 * NOT `useShoppingListStore((s) => s.items)`. This hook is called from
 * `RootNavigator`, which renders 93 `<Stack.Screen>` elements with freshly
 * allocated inline options — a selector subscription here would re-render all
 * of them every time the user ticks an item off. A subscription re-renders
 * nothing.
 *
 * Cost for a user with no session running: `refreshSessionItems` reads the
 * (absent) MMKV row and returns. Nothing else.
 */
export function useShoppingModeListSync(): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // `items` is derived from `lists` by a module-scope subscription in the
    // store (`recomputeActiveItems`), which hands back the active list's own
    // `items` array by reference rather than copying it. The selector
    // overload's default `Object.is` check therefore filters out every `set`
    // that leaves that reference alone — renaming a list, or creating,
    // deleting or archiving a different one, all spread or filter `lists`
    // while keeping each list's `items` array untouched.
    //
    // It is NOT one call per real change, though. `toggleChecked` and its
    // siblings map EVERY list, so ticking an item off a *different* list still
    // allocates a new array here; and `hydrate()`'s merge rebuilds all of them
    // from SQLite even when nothing changed. Both fire this callback with
    // identical content. That is harmless rather than something to fix here:
    // `refreshSessionItems` compares the derived count and labels by value and
    // returns without writing when they match.
    return useShoppingListStore.subscribe((s) => s.items, refreshSessionItems);
  }, []);
}
