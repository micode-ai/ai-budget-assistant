import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'first-run' });
const KEY = 'seen';
const CHECKLIST_DISMISSED_KEY = 'checklistDismissed';

/** Pure so the default can be tested without mocking MMKV. */
export function resolveSeen(read: (key: string) => string | undefined): boolean {
  return read(KEY) === 'true';
}

/**
 * Has the user dismissed the setup checklist card?
 *
 * Same shape as `resolveSeen` on purpose: a strict `=== 'true'` means an
 * absent, truncated or hand-edited value resolves to `false` — the checklist
 * is shown. That is the safe direction. The opposite default would hide, on
 * one unreadable byte, the only surface that explains why Safe to Spend reads
 * 0,00; and unlike a number this can never become `NaN` and never throws,
 * because nothing is parsed.
 */
export function resolveChecklistDismissed(read: (key: string) => string | undefined): boolean {
  return read(CHECKLIST_DISMISSED_KEY) === 'true';
}

/** Where onboarding hands the user off once it is finished. */
export type FirstRunNext = 'welcome';

interface FirstRunState {
  seen: boolean;
  /**
   * Deliberately NOT persisted — session-scoped intent, not a preference.
   *
   * The email-verification path is the only caller: it sets this
   * *synchronously* before `router.replace('/get-started')`, so the
   * onboarding trigger in `useFirstRunOnboarding` can see it without racing
   * anything. Carrying the destination out-of-band rather than only in the
   * `?next=welcome` URL param is what makes the pricing screen survive a
   * clobbering navigation: a param lives on one route instance, this does not.
   */
  nextAfter: FirstRunNext | null;
  /**
   * Persisted, device-local, and deliberately NOT cleared on sign-out —
   * exactly like `seen` beside it, which this store has always treated as a
   * property of the browser/install rather than of the account (see
   * `resolveWebFirstRun`'s note that MMKV is localStorage-backed on web).
   * There is no `reset()` on this store and none is added here: adding one
   * for this field alone would silently change `seen`'s meaning too, and
   * `seen` is what `authSessionActions` MARKS on a credential restore rather
   * than clears.
   */
  checklistDismissed: boolean;
  markSeen: () => void;
  setNextAfter: (next: FirstRunNext | null) => void;
  /** One-way. Nothing un-dismisses it; the card also disappears on its own
   *  once every step is done (`isSetupComplete`). */
  dismissChecklist: () => void;
}

export const useFirstRunStore = create<FirstRunState>((set) => ({
  seen: resolveSeen((k) => mmkv.getString(k)),
  nextAfter: null,
  checklistDismissed: resolveChecklistDismissed((k) => mmkv.getString(k)),
  markSeen: () => {
    mmkv.set(KEY, 'true');
    set({ seen: true });
  },
  setNextAfter: (next) => set({ nextAfter: next }),
  dismissChecklist: () => {
    mmkv.set(CHECKLIST_DISMISSED_KEY, 'true');
    set({ checklistDismissed: true });
  },
}));
