import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'invite-prompt' });
const SHOWN_AT_KEY = 'lastShownAt';
const DISMISSALS_KEY = 'dismissals';

/** Pure so the defaults can be tested without mocking MMKV (firstRunStore convention). */
export function resolveLastShownAt(read: (key: string) => string | undefined): number | null {
  const raw = read(SHOWN_AT_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  // A hand-edited or truncated value reads as "never shown" rather than NaN,
  // which would compare false against every operand and disable the interval.
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveDismissals(read: (key: string) => string | undefined): number {
  const parsed = Number(read(DISMISSALS_KEY));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

interface InvitePromptState {
  lastShownAt: number | null;
  dismissals: number;
  /** Called when the card is actually rendered, so the interval starts then. */
  markShown: (now?: number) => void;
  /** Closing the card without acting. Enough of these and it stops appearing. */
  markDismissed: () => void;
  /**
   * The user shared an invite. Resets the dismissal count — someone who acted
   * has not refused anything, and a later offer to a willing sharer is welcome
   * rather than nagging.
   */
  markAccepted: () => void;
}

export const useInvitePromptStore = create<InvitePromptState>((set) => ({
  lastShownAt: resolveLastShownAt((k) => mmkv.getString(k)),
  dismissals: resolveDismissals((k) => mmkv.getString(k)),
  markShown: (now = Date.now()) => {
    mmkv.set(SHOWN_AT_KEY, String(now));
    set({ lastShownAt: now });
  },
  markDismissed: () =>
    set((s) => {
      const next = s.dismissals + 1;
      mmkv.set(DISMISSALS_KEY, String(next));
      return { dismissals: next };
    }),
  markAccepted: () => {
    mmkv.set(DISMISSALS_KEY, '0');
    set({ dismissals: 0 });
  },
}));
