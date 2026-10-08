import { router } from 'expo-router';
import { useImportStore } from '@/stores/importStore';
import { useFirstRunStore } from '@/stores/firstRunStore';

/**
 * Leave the import flow once it is done (ABA-643). An import started from the first-run screen
 * finishes onboarding — the same destination `GetStartedMobile.finish()` uses (pricing after the
 * email-verification path, the tabs otherwise); any other import returns to settings as before.
 */
export function exitImportFlow(): void {
  const fromOnboarding = useImportStore.getState().origin === 'onboarding';
  useImportStore.getState().setOrigin(null);
  if (!fromOnboarding) {
    router.replace('/settings');
    return;
  }
  const firstRun = useFirstRunStore.getState();
  firstRun.markSeen();
  router.replace(firstRun.nextAfter === 'welcome' ? '/welcome' : '/(tabs)');
}
