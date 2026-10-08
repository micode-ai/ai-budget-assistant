import { useEffect } from 'react';
import {
  processGroupLink,
  takePendingGroupLink,
} from '@/features/groups/processGroupLink';

/**
 * Finishes a group link that arrived while the user was signed out.
 *
 * The route `app/groups/link.tsx` stashes the one-time code (`pendingGroupLink`) and sends a signed-out
 * user to register / sign in. This hook picks it up once the app is fully ready, gated by the SAME
 * cold-start value as the notification and trip-invite flushes (`coldStartGateReady`: init done,
 * authenticated, fonts loaded), so it never navigates before the navigation tree exists.
 *
 * A signed-in user opening a link never reaches this path: the router renders `groups/link`
 * directly, which spends the code itself. `processGroupLink` is idempotent per code, so even if both
 * ran the code would be spent once.
 */
export function useGroupLinkDeepLink(coldStartGateReady: boolean): void {
  useEffect(() => {
    if (!coldStartGateReady) return;
    let cancelled = false;
    void takePendingGroupLink()
      .then((code) => {
        if (code && !cancelled) return processGroupLink(code, 'push');
        return undefined;
      })
      .catch((e) => console.warn('[useGroupLinkDeepLink] flush failed:', e));
    return () => {
      cancelled = true;
    };
  }, [coldStartGateReady]);
}
