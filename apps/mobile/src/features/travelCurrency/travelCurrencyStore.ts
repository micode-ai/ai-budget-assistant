import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'travel-currency' });
const DISMISSED_KEY = 'dismissedCountries';
const REMEMBERED_KEY = 'remembered';
const STREAK_KEY = 'streak';

export const REMEMBER_DAYS = 14;
export const TRIP_WALLET_STREAK = 3;

type Remembered = Record<string, { currency: string; expiresAt: number }>;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = mmkv.getString(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Pure: the remembered currency for an account, or null once expired. */
export function activeRemembered(
  remembered: Remembered,
  accountId: string | undefined,
  now: number,
): string | null {
  const r = accountId ? remembered[accountId] : undefined;
  return r && r.expiresAt > now ? r.currency : null;
}

interface TravelCurrencyState {
  dismissedCountries: string[];
  remembered: Remembered;
  /** Number of suggestions shown since the last dismissal. */
  streak: number;
  dismissCountry: (countryCode: string) => void;
  remember: (accountId: string, currency: string, now?: number) => void;
  /** Drops the remembered travel currency (the user switched back, or is home). */
  forget: (accountId: string) => void;
  recordShown: () => void;
  resetStreak: () => void;
}

export const useTravelCurrencyStore = create<TravelCurrencyState>((set, get) => ({
  dismissedCountries: readJson<string[]>(DISMISSED_KEY, []),
  remembered: readJson<Remembered>(REMEMBERED_KEY, {}),
  streak: mmkv.getNumber(STREAK_KEY) ?? 0,
  dismissCountry: (countryCode) => {
    const next = Array.from(new Set([...get().dismissedCountries, countryCode.toUpperCase()]));
    mmkv.set(DISMISSED_KEY, JSON.stringify(next));
    set({ dismissedCountries: next });
  },
  remember: (accountId, currency, now = Date.now()) => {
    const next = {
      ...get().remembered,
      [accountId]: { currency, expiresAt: now + REMEMBER_DAYS * 86400000 },
    };
    mmkv.set(REMEMBERED_KEY, JSON.stringify(next));
    set({ remembered: next });
  },
  forget: (accountId) => {
    if (!get().remembered[accountId]) return;
    const next = { ...get().remembered };
    delete next[accountId];
    mmkv.set(REMEMBERED_KEY, JSON.stringify(next));
    set({ remembered: next });
  },
  recordShown: () => {
    const streak = get().streak + 1;
    mmkv.set(STREAK_KEY, streak);
    set({ streak });
  },
  resetStreak: () => {
    mmkv.set(STREAK_KEY, 0);
    set({ streak: 0 });
  },
}));
