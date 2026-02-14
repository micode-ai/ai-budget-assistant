import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

interface SimpleStorage {
  get: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
}

// In-memory fallback for Expo Go / environments without TurboModules
const memFallback: Record<string, string> = {};
const storage: SimpleStorage = {
  get: (key: string) => memFallback[key],
  set: (key: string, value: string) => { memFallback[key] = value; },
};

// Attempt to upgrade storage to MMKV asynchronously
import('react-native-mmkv')
  .then(({ MMKV }) => {
    const mmkv = new MMKV({ id: 'theme-storage' });
    storage.get = (key: string) => mmkv.getString(key);
    storage.set = (key: string, value: string) => mmkv.set(key, value);

    // Re-read persisted theme once MMKV is available
    const persisted = mmkv.getString('themeMode') as ThemeMode | undefined;
    if (persisted) {
      useThemeStore.setState({ mode: persisted });
    }
  })
  .catch(() => {
    // MMKV not available — keep in-memory fallback
  });

export const useThemeStore = create<ThemeState>((set) => ({
  mode: (storage.get('themeMode') as ThemeMode) || 'system',
  setMode: (mode) => {
    storage.set('themeMode', mode);
    set({ mode });
  },
}));
