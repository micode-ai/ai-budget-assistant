import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

// Simple storage abstraction — MMKV when available, in-memory fallback
const createStorage = () => {
  try {
    const { MMKV } = require('react-native-mmkv');
    const mmkv = new MMKV({ id: 'theme-storage' });
    return {
      get: (key: string) => mmkv.getString(key),
      set: (key: string, value: string) => mmkv.set(key, value),
    };
  } catch {
    // Fallback for Expo Go / environments without TurboModules
    const mem: Record<string, string> = {};
    return {
      get: (key: string) => mem[key],
      set: (key: string, value: string) => { mem[key] = value; },
    };
  }
};

const storage = createStorage();

export const useThemeStore = create<ThemeState>((set) => ({
  mode: (storage.get('themeMode') as ThemeMode) || 'system',
  setMode: (mode) => {
    storage.set('themeMode', mode);
    set({ mode });
  },
}));
