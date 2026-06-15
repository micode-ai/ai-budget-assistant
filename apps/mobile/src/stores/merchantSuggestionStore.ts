import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'merchant-suggestions' });
const KEY = 'dismissed';

/**
 * Pure: parse the stored JSON array of dismissed suggestion fingerprints into a
 * Set. Tolerant of missing/corrupt data (returns an empty Set). Exported so the
 * resolution logic is unit-testable without mocking MMKV.
 */
export const resolveDismissed = (raw: string | undefined): Set<string> => {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
};

interface MerchantSuggestionState {
  /** Fingerprints of merchant-grouping suggestions the user has dismissed. */
  dismissed: Set<string>;
  /** Permanently hide the suggestion for a given brand fingerprint. */
  dismiss: (fingerprint: string) => void;
  /** Clear all dismissals (suggestions reappear). */
  reset: () => void;
}

export const useMerchantSuggestionStore = create<MerchantSuggestionState>((set) => ({
  dismissed: resolveDismissed(mmkv.getString(KEY)),

  dismiss: (fingerprint) =>
    set((s) => {
      const next = new Set(s.dismissed).add(fingerprint);
      mmkv.set(KEY, JSON.stringify([...next]));
      return { dismissed: next };
    }),

  reset: () =>
    set(() => {
      mmkv.delete(KEY);
      return { dismissed: new Set() };
    }),
}));
