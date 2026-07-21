import { useEffect } from 'react';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { seedLegacyThemeFromLocal } from '@/stores/themeStore';
import { registerForPushNotifications } from '@/services/notifications';
import { api } from '@/services/api';
import i18n from '@/i18n';

/**
 * Auth-triggered side effects — split out of the deep-link concerns because
 * these aren't about navigation, they're one-time setup that only makes
 * sense once a user is signed in:
 *
 * - Loads the subscription tier once, right after auth, so Pro-gates
 *   (shopping-list compare, Story/Fat-Finder/AI-Insights) don't
 *   false-paywall a paid user who reaches the feature before AiUsageBadge /
 *   the subscription screens have loaded it.
 * - Registers for push notifications and syncs the user's language to the
 *   server, delayed slightly so the navigation stack settles before the OS
 *   permission dialog appears — avoids a crash on Android when the dialog
 *   dismisses into a partially-mounted screen.
 */
export function useAuthenticatedBootstrap(isAuthenticated: boolean): void {
  useEffect(() => {
    if (!isAuthenticated) return;
    void useSubscriptionStore.getState().loadSubscription();
    seedLegacyThemeFromLocal();
    const timer = setTimeout(() => {
      registerForPushNotifications();
      api.updateProfile({ language: i18n.language }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [isAuthenticated]);
}
