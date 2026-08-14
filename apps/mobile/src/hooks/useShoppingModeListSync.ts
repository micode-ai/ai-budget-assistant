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
    // store, so it is a fresh array on every list change; the selector
    // overload's default `Object.is` check is what keeps this to one call per
    // actual change rather than one per `set`.
    return useShoppingListStore.subscribe((s) => s.items, refreshSessionItems);
  }, []);
}
