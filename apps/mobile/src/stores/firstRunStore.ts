import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'first-run' });
const KEY = 'seen';

/** Pure so the default can be tested without mocking MMKV. */
export function resolveSeen(read: (key: string) => string | undefined): boolean {
  return read(KEY) === 'true';
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
  markSeen: () => void;
  setNextAfter: (next: FirstRunNext | null) => void;
}

export const useFirstRunStore = create<FirstRunState>((set) => ({
  seen: resolveSeen((k) => mmkv.getString(k)),
  nextAfter: null,
  markSeen: () => {
    mmkv.set(KEY, 'true');
    set({ seen: true });
  },
  setNextAfter: (next) => set({ nextAfter: next }),
}));
