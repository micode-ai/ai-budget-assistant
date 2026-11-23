import type { TFunction } from 'i18next';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useUpgradeStore } from '@/stores/upgradeStore';

/**
 * Groups are Pro. Confirm the tier first (the store defaults to 'free' until loaded); when it cannot be read,
 * open the editor anyway: the server's TIER_REQUIRED still opens the upgrade sheet.
 */
export async function startNewGroup(t: TFunction, openEditor: () => void): Promise<void> {
  await useSubscriptionStore.getState().loadSubscription();
  const sub = useSubscriptionStore.getState();
  if (!sub.error && sub.tier === 'free') {
    useUpgradeStore.getState().show(t('allAccounts.groups.title'), 'pro');
    return;
  }
  openEditor();
}
