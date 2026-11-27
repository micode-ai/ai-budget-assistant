import { AppState, Platform } from 'react-native';

/** While the screen is focused, online and visible, look for a reply this often. */
export const SUPPORT_POLL_MS = 20_000;

/**
 * Whether the user can actually see the app right now: on native the app is
 * `active` (not backgrounded or behind the app switcher), on web the tab is not
 * `hidden`. A poll in the dark is worse than wasteful here — one that finds
 * unread replies marks them read and clears the dot for a reply nobody saw.
 */
export function isAppVisible(
  os: string = Platform.OS,
  appState: string = AppState.currentState,
  visibilityState: string | undefined = typeof document !== 'undefined' ? document.visibilityState : undefined,
): boolean {
  if (os === 'web') return visibilityState !== 'hidden';
  return appState === 'active';
}

/**
 * Starts the reply poll; returns its stop function. Started from the screen's
 * `useFocusEffect` and stopped by its cleanup, so a `/support` stacked under
 * another screen does not poll. Each tick is skipped while `canPoll()` is false
 * (offline, or not visible).
 */
export function startSupportPoll(tick: () => void, canPoll: () => boolean, intervalMs = SUPPORT_POLL_MS): () => void {
  const id = setInterval(() => {
    if (canPoll()) tick();
  }, intervalMs);
  return () => clearInterval(id);
}
