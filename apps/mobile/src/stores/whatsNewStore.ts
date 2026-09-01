import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'whats-new' });
const KEY = 'lastSeenId';

/**
 * Pure so the default can be tested without mocking MMKV — mirrors
 * `firstRunStore.resolveSeen`. `undefined` (never persisted) becomes `null`,
 * meaning "never evaluated on this device"; see `useWhatsNewSpotlight` for
 * what that distinction drives.
 */
export function resolveLastSeenId(read: (key: string) => string | undefined): string | null {
  return read(KEY) ?? null;
}

interface WhatsNewState {
  lastSeenId: string | null;
  markSeen: (id: string) => void;
}

export const useWhatsNewStore = create<WhatsNewState>((set) => ({
  lastSeenId: resolveLastSeenId((k) => mmkv.getString(k)),
  markSeen: (id) => {
    mmkv.set(KEY, id);
    set({ lastSeenId: id });
  },
}));
