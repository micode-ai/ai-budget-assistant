import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'review-prompt' });
const ASKED_AT_KEY = 'lastAskedAt';
const ASKED_VERSION_KEY = 'lastAskedVersion';

/** Pure so the defaults can be tested without mocking MMKV (firstRunStore convention). */
export function resolveLastAskedAt(read: (key: string) => string | undefined): number | null {
  const raw = read(ASKED_AT_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  // A hand-edited or truncated value must read as "never asked", not as NaN
  // flowing into a date comparison that is false for every operand.
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveLastAskedVersion(read: (key: string) => string | undefined): string | null {
  return read(ASKED_VERSION_KEY) ?? null;
}

interface ReviewPromptState {
  lastAskedAt: number | null;
  lastAskedVersion: string | null;
  /**
   * Records that a request was FIRED, not that a review was left — Play never
   * tells us which happened, and treating "shown" as the throttle point is
   * what keeps a quota-dropped request from being retried on every save.
   */
  markAsked: (version: string, now?: number) => void;
}

export const useReviewPromptStore = create<ReviewPromptState>((set) => ({
  lastAskedAt: resolveLastAskedAt((k) => mmkv.getString(k)),
  lastAskedVersion: resolveLastAskedVersion((k) => mmkv.getString(k)),
  markAsked: (version, now = Date.now()) => {
    mmkv.set(ASKED_AT_KEY, String(now));
    mmkv.set(ASKED_VERSION_KEY, version);
    set({ lastAskedAt: now, lastAskedVersion: version });
  },
}));
