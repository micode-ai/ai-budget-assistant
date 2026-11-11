import { useCallback, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';
import { shouldShowLeafletConsentNotice } from './leafletConsent';

export interface LeafletConsentNoticeState {
  visible: boolean;
  /** "OK": the server stamps `leafletConsentNoticeAt`, so leaflet promos start contributing. */
  acknowledge: () => void;
  /** "Stop sharing": turns community sharing off altogether (receipts too), as Data settings would. */
  decline: () => void;
}

/**
 * Drives the one-time leaflet consent notice. Both actions are optimistic: the notice closes at
 * once, and a failed save restores the user fields so it shows again on the next visit - never in
 * the same session, which would trap an offline user in a sheet that cannot be closed.
 */
export function useLeafletConsentNotice(): LeafletConsentNoticeState {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [closed, setClosed] = useState(false);

  const acknowledge = useCallback(() => {
    setClosed(true);
    updateUser({ leafletConsentNoticeAt: new Date().toISOString() });
    api
      .updateProfile({ leafletConsentNoticeAt: 'now' })
      .then((res: { leafletConsentNoticeAt?: string | null } | undefined) => {
        if (res?.leafletConsentNoticeAt) updateUser({ leafletConsentNoticeAt: String(res.leafletConsentNoticeAt) });
      })
      .catch((e: unknown) => {
        console.warn('Failed to save the leaflet consent notice', e);
        updateUser({ leafletConsentNoticeAt: null });
      });
  }, [updateUser]);

  const decline = useCallback(() => {
    setClosed(true);
    updateUser({ contributeCommunityPrices: false });
    api.updateProfile({ contributeCommunityPrices: false }).catch((e: unknown) => {
      console.warn('Failed to turn off community-price sharing', e);
      updateUser({ contributeCommunityPrices: true });
    });
  }, [updateUser]);

  return { visible: !closed && shouldShowLeafletConsentNotice(user), acknowledge, decline };
}
