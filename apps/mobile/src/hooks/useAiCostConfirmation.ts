import { useCallback, useRef } from 'react';
import { showAlert } from '@/utils/alert';
import { useTranslation } from 'react-i18next';
import { MMKV } from 'react-native-mmkv';
import { useSubscriptionStore } from '@/stores/subscriptionStore';

const mmkv = new MMKV({ id: 'ai-cost-confirmation' });
const DISMISSED_KEY_PREFIX = 'ai_cost_dismissed_';

/**
 * Hook that shows a one-time confirmation dialog before expensive AI operations.
 * Returns a stable function that resolves to `true` if the user confirms (or already dismissed),
 * or `false` if the user cancels.
 */
export function useAiCostConfirmation() {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;

  const confirmAiUsage = useCallback(
    async (featureKey: string, costCredits: number): Promise<boolean> => {
      // Read fresh values from store at call time, not from closure
      const { tier, aiRequestsUsed, aiRequestsLimit } = useSubscriptionStore.getState();

      if (tier === 'business') return true;

      const storageKey = `${DISMISSED_KEY_PREFIX}${featureKey}`;
      if (mmkv.getBoolean(storageKey)) return true;

      const remaining = Math.max(0, aiRequestsLimit - aiRequestsUsed);
      const currentT = tRef.current;

      return new Promise((resolve) => {
        showAlert(
          currentT('aiUsage.confirmTitle'),
          currentT('aiUsage.confirmMessage', {
            cost: costCredits,
            used: aiRequestsUsed,
            limit: aiRequestsLimit,
            remaining,
          }),
          [
            {
              text: currentT('common.cancel'),
              style: 'cancel',
              onPress: () => resolve(false),
            },
            {
              text: currentT('aiUsage.dontAskAgain'),
              onPress: () => {
                mmkv.set(storageKey, true);
                resolve(true);
              },
            },
            {
              text: currentT('aiUsage.continue'),
              style: 'default',
              onPress: () => resolve(true),
            },
          ],
        );
      });
    },
    [], // stable — no deps, reads fresh values via getState() and ref
  );

  return { confirmAiUsage };
}
