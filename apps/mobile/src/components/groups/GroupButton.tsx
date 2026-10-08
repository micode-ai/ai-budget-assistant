import React from 'react';
import { Text, TouchableOpacity, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, useStyles, type Theme } from '@/theme';

interface GroupButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** The one button shape used across the group screens. */
export function GroupButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: GroupButtonProps) {
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const inactive = disabled || loading;
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
