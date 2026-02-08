import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useThemeStore } from '@/stores/themeStore';
import { lightColors, darkColors, type ThemeColors } from './colors';
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
  const { mode } = useThemeStore();
  const systemScheme = useColorScheme();

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

  const theme = useMemo<Theme>(() => ({
    colors: isDark ? darkColors : lightColors,
    shadows: isDark ? darkShadows : shadows,
    spacing,
    borderRadius,
    textStyles,
    fonts: fontFamilies,
    isDark,
  }), [isDark]);

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
