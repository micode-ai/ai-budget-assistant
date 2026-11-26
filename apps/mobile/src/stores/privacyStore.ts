import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import { setAmountMask } from '@budget/shared-utils';

const mmkv = new MMKV({ id: 'privacy' });
const KEY = 'privacyMode';

interface PrivacyState {
  privacyMode: boolean;
  toggle: () => void;
}

const initial = mmkv.getBoolean(KEY) ?? false;
setAmountMask(initial);

export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  privacyMode: initial,
  toggle: () => {
    const next = !get().privacyMode;
    mmkv.set(KEY, next);
    setAmountMask(next);
    set({ privacyMode: next });
  },
}));

/** Components that show amounts and must repaint on a flip read this (never conditionally). */
export function usePrivacyMasked(): boolean {
  return usePrivacyStore((s) => s.privacyMode);
}
