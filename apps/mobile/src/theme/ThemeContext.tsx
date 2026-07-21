import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import { lightColors, darkColors, type ThemeColors } from './colors';
import { deriveAccentColors } from './deriveAccent';
import { shadows, darkShadows, type ShadowPresets } from './shadows';
import { spacing } from './spacing';
import { borderRadius } from './borderRadius';
import { textStyles, fontFamilies } from './typography';

export interface Theme {
  colors: ThemeColors;
  shadows: ShadowPresets;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  textStyles: typeof textStyles;
  fonts: typeof fontFamilies;
  isDark: boolean;
}

const defaultTheme: Theme = {
  colors: lightColors,
  shadows,
  spacing,
  borderRadius,
  textStyles,
  fonts: fontFamilies,
  isDark: false,
};

const ThemeContext = createContext<Theme>(defaultTheme);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const localMode = useThemeStore((s) => s.mode);
  const localAccent = useThemeStore((s) => s.accent);
  const user = useAuthStore((s) => s.user);
  const systemScheme = useColorScheme();

  // When authenticated, the user row is the sole source of truth; otherwise
  // fall back to the local MMKV mirror (instant paint / pre-auth screens).
  const mode = user?.themeMode ?? localMode ?? 'system';
  const accent = user ? (user.accentColor ?? null) : (localAccent ?? null);

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

  const theme = useMemo<Theme>(() => {
    const base = isDark ? darkColors : lightColors;
    const colors: ThemeColors = accent
      ? { ...base, ...deriveAccentColors(base, accent, isDark) }
      : base;
    return {
      colors,
      shadows: isDark ? darkShadows : shadows,
      spacing,
      borderRadius,
      textStyles,
      fonts: fontFamilies,
      isDark,
    };
  }, [isDark, accent]);

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
