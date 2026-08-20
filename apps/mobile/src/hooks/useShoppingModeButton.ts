import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { useAccountStore } from '@/stores/accountStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useHydrationStore } from '@/stores/hydrateTransactions';
import { useInsightsStore } from '@/stores/insightsStore';
import { useShoppingModeStore } from '@/stores/shoppingModeStore';
import { buildSessionSnapshot } from '@/features/shopping-mode/snapshot';
import { startShoppingMode, stopShoppingMode } from '@/services/shoppingMode';
import type { ShoppingListItem } from '@budget/shared-types';

/**
 * Owns the "I'm going shopping" button's session lifecycle for the shopping-list
 * screen: starting/stopping the Android foreground-location session, the
 * not-ready/no-shops/permission Alert branching, and re-syncing the button's
 * label when a session ends on its own (exit, or the two-hour cap) while the
 * app is backgrounded — see CLAUDE.md's Shopping Mode entry for why both the
 * focus and AppState listeners below are needed (neither subsumes the other).
 *
 * Everything the snapshot needs beyond `items` (expenses, safe-to-spend) is
 * read once, at press time, straight from the stores — subscribing to them
 * here would re-render the caller on changes that never touch this button.
 */
export function useShoppingModeButton(items: ShoppingListItem[]) {
  const { t, i18n } = useTranslation();
  const currentAccountId = useAccountStore((s) => s.currentAccountId);

  const active = useShoppingModeStore((s) => s.active);
  const refreshFromDisk = useShoppingModeStore((s) => s.refreshFromDisk);
  // startShoppingMode stops any running service before starting a new one, so
  // a double tap is the easiest way to have a stop resolve into a freshly
  // started service and kill it right after. One press at a time.
  const busy = useRef(false);

  useFocusEffect(
    useCallback(() => {
      refreshFromDisk();
    }, [refreshFromDisk]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s !== 'active') return;
      refreshFromDisk();
    });
    return () => sub.remove();
  }, [refreshFromDisk]);

  const toggle = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (active) {
        await stopShoppingMode();
        refreshFromDisk();
        return;
      }

      const expenses = useExpenseStore.getState().expenses;
      const snapshot = buildSessionSnapshot({
        accountId: currentAccountId ?? '',
        // The live UI language, not a field on the user: the mobile `User`
        // entity carries no `language` — the client owns it and merely tells
        // the server about it. This is the same i18n instance the headless
        // notification path resolves `{ lng: snapshot.language }` against, so
        // the two cannot disagree.
        language: i18n.language,
        expenses,
        items,
        // The cached figure the home hero already shows, not a fresh fetch: it
        // is a daily number, the home tab refreshes it on every app start, and
        // a null here degrades the arrival notification to its no-figure
        // wording rather than blocking anything.
        safeToSpend: useInsightsStore.getState().safeToSpend,
      });

      // A session that can never fire is worse than no button: say so instead.
      if (snapshot.centres.length === 0) {
        // ...but say the RIGHT thing. `/shopping-list` is reachable straight
        // from a `shopping_reminder` / `shopping_deal` push deep link, which
        // can land the user here while `hydrateTransactions()` is still in
        // flight and the expense store is empty. Telling someone holding
        // hundreds of receipts to "scan a few receipts first" is a lie about
        // their own data; "not loaded yet" is the truth, and it self-corrects
        // on the retry a second later. An empty store with nothing loading is
        // a genuinely empty account, where the original wording is right.
        const stillLoading =
          expenses.length === 0 &&
          (useHydrationStore.getState().isHydrating || useExpenseStore.getState().isLoading);
        showAlert(
          t(stillLoading ? 'shoppingMode.notReadyTitle' : 'shoppingMode.noShopsTitle'),
          t(stillLoading ? 'shoppingMode.notReadyBody' : 'shoppingMode.noShopsBody'),
        );
        return;
      }

      const result = await startShoppingMode(snapshot);
      // Same explain-and-abort shape as the no-shops and no-permission cases:
      // nothing is running, and the user is told which of the two permissions
      // the mode cannot work without. Notifications are not a nicety here —
      // they are the whole output, including the persistent service
      // notification the user is meant to see for the entire session.
      if (result === 'no_permission' || result === 'no_notifications') {
        const notifications = result === 'no_notifications';
        showAlert(
          t(notifications ? 'shoppingMode.notifyPermissionTitle' : 'shoppingMode.permissionTitle'),
          t(notifications ? 'shoppingMode.notifyPermissionBody' : 'shoppingMode.permissionBody'),
        );
        return;
      }
      refreshFromDisk();
    } finally {
      busy.current = false;
    }
  }, [active, currentAccountId, i18n.language, items, refreshFromDisk, t]);

  return { active, toggle };
}
