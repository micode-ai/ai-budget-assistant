import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const mmkv = new MMKV({ id: 'theme-storage' });

export const useThemeStore = create<ThemeState>((set) => ({
  mode: (mmkv.getString('themeMode') as ThemeMode) || 'system',
  setMode: (mode) => {
    mmkv.set('themeMode', mode);
    set({ mode });
  },
}));
