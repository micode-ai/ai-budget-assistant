import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useTheme, type Theme } from './ThemeContext';

export function useStyles<T extends StyleSheet.NamedStyles<T>>(
  createStyles: (theme: Theme) => T
): T {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(createStyles(theme)), [theme, createStyles]);
}
