import React from 'react';
import { Text, TouchableOpacity, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useConnectivity } from '@/hooks/useConnectivity';
import { useTheme, useStyles, type Theme } from '@/theme';

interface GroupButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  /** A server write: disabled (with an a11y hint) while the app is offline. */
  write?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** The one button shape used across the group screens. */
export function GroupButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  write = false,
  style,
}: GroupButtonProps) {
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { t } = useTranslation();
  const { isOffline } = useConnectivity();
  const offlineBlocked = write && isOffline;
  const inactive = disabled || loading || offlineBlocked;
  const textColor =
    variant === 'primary'
      ? theme.colors.textInverse
      : variant === 'danger'
        ? theme.colors.danger
        : theme.colors.primary;

  return (
    <TouchableOpacity
      style={[styles.base, styles[variant], inactive && styles.inactive, style]}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      accessibilityHint={offlineBlocked ? t('groups.offlineBanner') : undefined}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.text, { color: textColor }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  base: {
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3.5],
    paddingHorizontal: theme.spacing[4],
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 48,
  },
  primary: {
    backgroundColor: theme.colors.primary,
  },
  secondary: {
    backgroundColor: theme.colors.primaryLight,
  },
  danger: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.danger,
  },
  inactive: {
    opacity: 0.55,
  },
  text: {
    ...theme.textStyles.button,
  },
});
