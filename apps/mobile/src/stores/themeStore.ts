import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import type { ThemeMode } from '@budget/shared-types';
import { api } from '../services/api';
import { useAuthStore } from './authStore';
import { applyThemePatch } from '../utils/theme';

interface ThemeState {
  mode: ThemeMode;
  accent: string | null;      // local fallback / mirror; null = default
  customAccent: string | null; // last custom color chosen (local only)
  setMode: (mode: ThemeMode) => void;
  setAccent: (hex: string | null) => void;
  setCustomAccent: (hex: string) => void;
}

const mmkv = new MMKV({ id: 'theme-storage' });

export const useThemeStore = create<ThemeState>((set) => ({
  mode: (mmkv.getString('themeMode') as ThemeMode) || 'system',
  accent: mmkv.getString('accentColor') ?? null,
  customAccent: mmkv.getString('customAccent') ?? null,

  setMode: (mode) => {
    mmkv.set('themeMode', mode);
    set({ mode });
    applyThemePatch(
      { themeMode: mode },
      {
        isLoggedIn: !!useAuthStore.getState().user,
        applyLocal: (p) => useAuthStore.getState().updateUser(p),
        persist: (p) => api.updateProfile(p),
        onPersistError: (e) => console.warn('Failed to persist theme mode:', e),
      },
    );
  },

  setAccent: (hex) => {
    if (hex === null) {
      mmkv.delete('accentColor');
    } else {
      mmkv.set('accentColor', hex);
    }
    set({ accent: hex });
    applyThemePatch(
      { accentColor: hex },
      {
        isLoggedIn: !!useAuthStore.getState().user,
        applyLocal: (p) => useAuthStore.getState().updateUser(p),
        persist: (p) => api.updateProfile(p),
        onPersistError: (e) => console.warn('Failed to persist accent color:', e),
      },
    );
  },

  setCustomAccent: (hex) => {
    mmkv.set('customAccent', hex);
    set({ customAccent: hex });
  },
}));

/**
 * One-time migration for users who chose an explicit light/dark mode before
 * themeMode was persisted server-side (it lived only in MMKV). Pushes that
 * local choice to the server so it survives across devices / biometric login.
 * Idempotent via the `themeSeededV1` flag; no-op for users already in sync.
 */
export function seedLegacyThemeFromLocal(): void {
  if (mmkv.getBoolean('themeSeededV1')) return;
  const user = useAuthStore.getState().user;
  if (!user) return; // only run once authenticated
  const localMode = mmkv.getString('themeMode') as ThemeMode | undefined;
  // Only migrate a real explicit choice that the server doesn't already reflect.
  if (localMode && localMode !== 'system' && localMode !== user.themeMode) {
    useThemeStore.getState().setMode(localMode);
  }
  mmkv.set('themeSeededV1', true);
}
