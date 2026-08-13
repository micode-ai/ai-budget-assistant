import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'first-run' });
const KEY = 'seen';

/** Pure so the default can be tested without mocking MMKV. */
export function resolveSeen(read: (key: string) => string | undefined): boolean {
  return read(KEY) === 'true';
}

interface FirstRunState {
  seen: boolean;
  markSeen: () => void;
}

export const useFirstRunStore = create<FirstRunState>((set) => ({
  seen: resolveSeen((k) => mmkv.getString(k)),
  markSeen: () => {
    mmkv.set(KEY, 'true');
    set({ seen: true });
  },
}));
