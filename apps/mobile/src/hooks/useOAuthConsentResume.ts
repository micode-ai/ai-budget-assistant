import { useEffect } from 'react';
import { router, useNavigationContainerRef } from 'expo-router';
import { takePendingConsent } from '@/features/oauth-consent/pendingConsent';
import { appStackRouteName, consentResumeDecision } from '@/features/oauth-consent/consentResume';

/**
 * Brings a person back to the OAuth consent page after they had to sign in first (Public API
 * phase 1). `useConsent` stashes the full request (`pendingOAuthConsent`) and sends a signed-out
 * visitor to the login screen; this hook reopens `/authorize?…` afterwards, whichever way they got
 * in (password, Google, passkey, a new registration).
 *
 * ## Deterministic ordering (review fix, Ruling 27)
 *
 * Every sign-in path sets `isAuthenticated` and then navigates itself (`router.replace('/(tabs)')`
 * from the login/register screens, `app/oauth.tsx`, the `(auth)` layout's `<Redirect>`). Opening
 * the gate is therefore NOT the moment to navigate: a resume that raced that replace could land
 * first and be swapped away, losing the already-consumed request. So the stash is consumed only
 * once the ROOT route the navigator is showing has left the sign-in surfaces (`(auth)`, `oauth`,
 * the root `index` redirect) — observed through the navigation ref's `state` listener, so
 * RootNavigator never re-renders for it (no `usePathname()` there). Then `replace`, not `push`:
 * the landing screen the sign-in produced is a transit state, and back from the consent page must
 * not stop on it.
 */
export function useOAuthConsentResume(coldStartGateReady: boolean): void {
  const navigationRef = useNavigationContainerRef();

  useEffect(() => {
    if (!coldStartGateReady) return;
    let cancelled = false;
    let settled = false;
    let running = false;

    const attempt = () => {
      if (cancelled || settled || running) return;
      if (!navigationRef.isReady()) return;
      const decision = consentResumeDecision(appStackRouteName(navigationRef.getRootState()));
      if (decision === 'wait') return;

      running = true;
      void takePendingConsent()
        .then((path) => {
          settled = true;
          if (!cancelled && path && decision === 'navigate') router.replace(path as never);
        })
        .catch((e) => {
          settled = true;
          console.warn('[useOAuthConsentResume] flush failed:', e);
        })
        .finally(() => {
          running = false;
        });
    };

    attempt();
    const unsubscribe = navigationRef.addListener('state', attempt);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [coldStartGateReady, navigationRef]);
}
