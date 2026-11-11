export type ShareGateDecision = 'wait' | 'navigate' | 'choose' | 'block_viewer' | 'idle';

/**
 * When a shared queue may open a screen. `coldStartGateReady` is the same
 * `useColdStartGate` value the notification/trip-invite flushes use —
 * navigating before it wedges expo-router on a black screen. `firstRunSeen`
 * keeps a brand-new user's onboarding from being covered. `screenOpen` means the
 * receipt screen is already showing a queue and consumes new shares itself, so
 * pushing again would stack a second copy.
 *
 * `kind` separates the two share shapes. Shared FILES end in `'choose'` — the
 * Receipts / Promo leaflet chooser — for a viewer too: a viewer may read a
 * leaflet, and the chooser simply hides Receipts for them. Shared TEXT keeps its
 * old rule, where the viewer check comes last so a viewer is told only once the
 * app is actually ready to show it.
 */
export function decideShareNavigation(i: {
  kind: 'files' | 'text';
  pendingNavigation: boolean;
  screenOpen: boolean;
  coldStartGateReady: boolean;
  firstRunSeen: boolean;
  canEdit: boolean;
}): ShareGateDecision {
  if (!i.pendingNavigation || i.screenOpen) return 'idle';
  if (!i.coldStartGateReady || !i.firstRunSeen) return 'wait';
  if (i.kind === 'files') return 'choose';
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
