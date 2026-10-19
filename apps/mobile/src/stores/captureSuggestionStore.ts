import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import { shouldSuggestFasterCapture } from '@/features/captureSuggestion/captureSuggestion';

const mmkv = new MMKV({ id: 'capture-suggestion' });
const SAVES_KEY = 'manualSaves';
const SHOWN_KEY = 'shown';

/**
 * ABA-682. Device-local on purpose, like the What's New pointer: the
 * suggestion is a nudge about this device's habits, and a second device seeing
 * it once more costs nothing. `isPending` is memory only — a suggestion that
 * was due but never drawn (the app closed first) is simply re-evaluated on the
 * next manual save, since `shown` was never set.
 */
interface CaptureSuggestionState {
  manualSaves: number;
  shown: boolean;
  isPending: boolean;
  /** Called once per completed manual save from the expense create form. */
  recordManualSave: (usedFasterCapture: boolean) => void;
  /** Called on any outcome — an option, "Not now", or a dismiss: it is shown once, ever. */
  markShown: () => void;
}

export const useCaptureSuggestionStore = create<CaptureSuggestionState>((set, get) => ({
  manualSaves: mmkv.getNumber(SAVES_KEY) ?? 0,
  shown: mmkv.getBoolean(SHOWN_KEY) ?? false,
  isPending: false,
  recordManualSave: (usedFasterCapture) => {
    const { shown, manualSaves } = get();
    if (shown) return;
    const next = manualSaves + 1;
    mmkv.set(SAVES_KEY, next);
    set({
      manualSaves: next,
      isPending: shouldSuggestFasterCapture({ manualSaves: next, alreadyShown: shown, usedFasterCapture }),
    });
  },
  markShown: () => {
    mmkv.set(SHOWN_KEY, true);
    set({ shown: true, isPending: false });
  },
}));
