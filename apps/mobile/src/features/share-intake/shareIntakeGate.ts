export type ShareGateDecision = 'wait' | 'navigate' | 'block_viewer' | 'idle';

/**
 * When a shared queue may open the receipt screen. `coldStartGateReady` is the
 * same `useColdStartGate` value the notification/trip-invite flushes use —
 * navigating before it wedges expo-router on a black screen. `firstRunSeen`
 * keeps a brand-new user's onboarding from being covered. `screenOpen` means the
 * receipt screen is already showing a queue and consumes new shares itself, so
 * pushing again would stack a second copy. The viewer check comes last so a
 * viewer is told only once the app is actually ready to show it.
 */
export function decideShareNavigation(i: {
  pendingNavigation: boolean;
  screenOpen: boolean;
  coldStartGateReady: boolean;
  firstRunSeen: boolean;
  canEdit: boolean;
}): ShareGateDecision {
  if (!i.pendingNavigation || i.screenOpen) return 'idle';
  if (!i.coldStartGateReady || !i.firstRunSeen) return 'wait';
  if (!i.canEdit) return 'block_viewer';
  return 'navigate';
}

/**
 * A share whose every file was dropped (too big, wrong type) opens no screen,
 * so the receipt screen never gets to report it — the root hook must, or the
 * count lingers and surfaces on some later, unrelated share.
 */
export function shouldAnnounceDropped(i: {
  lastDropped: number;
  pendingNavigation: boolean;
  screenOpen: boolean;
  coldStartGateReady: boolean;
}): boolean {
  return i.lastDropped > 0 && !i.pendingNavigation && !i.screenOpen && i.coldStartGateReady;
}
