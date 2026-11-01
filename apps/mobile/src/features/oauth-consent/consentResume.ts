/**
 * Root routes that are still part of signing in: the `(auth)` group, the Google relay landing
 * (`app/oauth.tsx`) and the root `index` redirect. While one of them is showing, the sign-in's own
 * navigation to the app has not landed yet, so resuming the consent page would race it.
 */
const SIGN_IN_ROOT_ROUTES: readonly string[] = ['(auth)', 'oauth', 'index'];

/**
 * What `useOAuthConsentResume` does for the root route currently shown:
 * - `wait`: not ready, or still on a sign-in surface; leave the stash alone.
 * - `discard`: already on the consent page; consume the stash but do not navigate again.
 * - `navigate`: the sign-in has landed in the app; consume the stash and replace onto `/authorize`.
 */
export function consentResumeDecision(rootRouteName: string | undefined): 'wait' | 'discard' | 'navigate' {
  if (!rootRouteName || SIGN_IN_ROOT_ROUTES.includes(rootRouteName)) return 'wait';
  if (rootRouteName === 'authorize') return 'discard';
  return 'navigate';
}

/**
 * expo-router's internal root route (`INTERNAL_SLOT_NAME` in `expo-router/build/constants`). Not
 * public API, so it is copied here and pinned by consentResume.test.ts against the installed version.
 */
export const EXPO_ROUTER_ROOT_ROUTE = '__root';

interface NavStateLike {
  index?: number;
  routes?: { name: string; state?: unknown }[];
}

/**
 * The route the app's ROOT stack (`app/_layout.tsx`) is showing, from the navigation container's
 * root state. expo-router wraps that stack in a single internal `__root` route (its
 * `INTERNAL_SLOT_NAME`), so the container's own top route is always `__root`; this steps into it.
 * `undefined` while the nested state does not exist yet.
 */
export function appStackRouteName(rootState: unknown): string | undefined {
  let state = rootState as NavStateLike | undefined;
  for (let depth = 0; depth < 3 && state; depth += 1) {
    const route = state.routes?.[state.index ?? 0];
    if (!route) return undefined;
    if (route.name !== EXPO_ROUTER_ROOT_ROUTE) return route.name;
    state = route.state as NavStateLike | undefined;
  }
  return undefined;
}
