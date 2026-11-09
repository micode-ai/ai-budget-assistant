/**
 * Deep-link paths that `useGenericDeepLink` alone navigates to: the launcher shortcuts
 * (`plugins/launcherShortcuts.json`) and the home-screen widgets open these.
 *
 * Expo Router also navigates to every incoming URL on its own (its initial URL on a cold
 * start, its Linking subscription on a warm one), so without this hand-off each tap opened
 * the screen twice or more. On a cold start the router also put the target screen at the
 * bottom of the stack, with no home screen to go Back to.
 */
export const HANDED_OFF_PATHS: readonly string[] = ['/expense/new', '/expense/receipt', '/expense/voice'];

/** `budget:///expense/new`, `budget://expense/new` or `/expense/new` → `/expense/new`; else null. */
export function deepLinkPath(url: string): string | null {
  const m = url.match(/^[a-z][a-z0-9+.-]*:\/\/\/?([^?#]*)/i);
  const raw = m ? m[1] : url.split(/[?#]/)[0];
  const path = `/${raw.replace(/^\/+/, '').replace(/\/+$/, '')}`;
  return path === '/' ? null : path;
}

/**
 * The router's side of the hand-off (`app/+native-intent.tsx`). A handed-off link starts the
 * app at home on a cold start (`initial`) and is ignored by the router on a warm one; every
 * other link is left to the router unchanged.
 */
export function redirectHandedOffLink(url: string, initial: boolean): string | null {
  const path = deepLinkPath(url);
  if (!path || !HANDED_OFF_PATHS.includes(path)) return url;
  return initial ? '/' : null;
}
