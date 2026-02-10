import React from 'react';
import { View, Text } from 'react-native';
import { useTheme, useStyles, type Theme } from '@/theme';

interface StoryNarrativeProps {
  text: string;
  tone?: 'positive' | 'neutral' | 'warning' | 'celebration';
}

const TONE_COLORS: Record<string, (theme: Theme) => { border: string; background: string }> = {
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

export function StoryNarrative({ text, tone = 'neutral' }: StoryNarrativeProps) {
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const toneColors = TONE_COLORS[tone]?.(theme) ?? TONE_COLORS.neutral(theme);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: toneColors.background,
          borderLeftColor: toneColors.border,
        },
      ]}
    >
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    borderRadius: theme.borderRadius.lg,
    borderLeftWidth: 4,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[4],
  },
  text: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    lineHeight: 22,
  },
});
