import React from 'react';
import { View, Text } from 'react-native';
import { useTheme, useStyles, type Theme } from '@/theme';

interface StoryCalloutProps {
  title?: string;
  text?: string;
  icon?: string;
  tone?: 'positive' | 'neutral' | 'warning' | 'celebration';
}

const TONE_STYLES: Record<
  string,
  (theme: Theme) => { border: string; background: string }
> = {
  positive: (theme) => ({
    border: theme.colors.success,
    background: theme.colors.primaryLight,
  }),
  neutral: (theme) => ({
    border: theme.colors.border,
    background: theme.colors.surfaceSecondary,
  }),
  warning: (theme) => ({
    border: theme.colors.warning,
    background: theme.colors.warningLight,
  }),
  celebration: (theme) => ({
    border: theme.colors.primary,
    background: theme.colors.primaryLight,
  }),
};

export function StoryCallout({
  title,
  text,
  icon,
  tone = 'neutral',
}: StoryCalloutProps) {
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const toneColors = TONE_STYLES[tone]?.(theme) ?? TONE_STYLES.neutral(theme);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: toneColors.background,
          borderColor: toneColors.border,
        },
      ]}
    >
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <View style={styles.content}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {text ? <Text style={styles.text}>{text}</Text> : null}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  icon: {
    fontSize: 28,
    lineHeight: 34,
  },
  content: {
    flex: 1,
    gap: theme.spacing[1],
  },
  title: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  text: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
});
