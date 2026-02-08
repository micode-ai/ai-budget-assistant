import type { Theme } from './ThemeContext';

export function getTabBarTheme(theme: Theme) {
  return {
    tabBarActiveTintColor: theme.colors.tabBarActive,
    tabBarInactiveTintColor: theme.colors.tabBarInactive,
    tabBarStyle: {
      backgroundColor: theme.colors.surface,
      borderTopColor: theme.colors.borderLight,
    },
    tabBarLabelStyle: {
      ...theme.textStyles.tabLabel,
    },
    headerStyle: {
      backgroundColor: theme.colors.primary,
    },
    headerTintColor: theme.colors.textInverse,
    headerTitleStyle: {
      fontFamily: theme.fonts.semiBold,
      fontSize: 18,
    },
  };
}

export function getStackHeaderTheme(theme: Theme) {
  return {
    headerStyle: {
      backgroundColor: theme.colors.surface,
    },
    headerTintColor: theme.colors.textPrimary,
    headerTitleStyle: {
      fontFamily: theme.fonts.semiBold,
      fontSize: 18,
    },
    contentStyle: {
      backgroundColor: theme.colors.background,
    },
  };
}
