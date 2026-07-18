import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useAccountStore } from '@/stores/accountStore';
import { extractTripInviteCode } from '@/utils/deepLink';
import { showAlert } from '@/utils/alert';

/**
 * Owns the trip-invite universal link (https://ai-budget.pl/trip-invite/<code>)
 * that opened or cold-started the app. Same two-phase pattern as
 * `useNotificationDeepLink`: this hook only CAPTURES the code (mount + warm
 * 'url' events); it must NOT be acted on until the navigation tree is
 * mounted and the auth/account context is loaded — the flush effect below
 * is gated identically to the notification flush via `coldStartGateReady`
 * (the exact same `useColdStartGate` value), per the documented "keep the
 * two deep-link paths gated symmetrically" rule.
 *
 * Auto-accepting (instead of routing to the manual account/join.tsx
 * code-entry screen) uses the same acceptInvitation() the manual flow
 * calls; the newly joined account is identified by diffing the account list
 * before/after since acceptInvitation only resolves void (it already
 * reloads accounts internally).
 */
export function useTripInviteDeepLink(coldStartGateReady: boolean, t: TFunction): void {
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);

  useEffect(() => {
    const sub = Linking.addEventListener('url', (event) => {
      const code = extractTripInviteCode(event.url);
      if (code) setPendingInviteCode(code);
    });

    Linking.getInitialURL()
      .then((url) => {
        if (url) {
          const code = extractTripInviteCode(url);
          if (code) setPendingInviteCode(code);
        }
      })
      .catch(() => {});

    return () => sub.remove();
  }, []);

  // Flush a pending trip-invite auto-accept once the app is fully ready.
  useEffect(() => {
    if (!coldStartGateReady || !pendingInviteCode) return;
    const beforeIds = new Set(useAccountStore.getState().accounts.map((a) => a.id));
    useAccountStore
      .getState()
      .acceptInvitation(pendingInviteCode)
      .then(() => {
        const newAccount = useAccountStore
          .getState()
          .accounts.find((a) => !beforeIds.has(a.id));
        if (newAccount) {
          useAccountStore.getState().switchAccount(newAccount.id);
        }
        router.replace('/(tabs)');
      })
      .catch((e) => {
        showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
      });
    setPendingInviteCode(null);
  }, [coldStartGateReady, pendingInviteCode, t]);
}
