import React from 'react';
import { View, Text } from 'react-native';
import { useStyles, useTheme, type Theme } from '@/theme';
import { useTranslation } from 'react-i18next';

interface StreakWidgetProps {
  currentStreak: number;
  longestStreak: number;
  compact?: boolean;
}

export function StreakWidget({ currentStreak, longestStreak, compact }: StreakWidgetProps) {
  const styles = useStyles(createStyles);
  const theme = useTheme();
  const { t } = useTranslation();
  const isActive = currentStreak > 0;

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <Text style={styles.compactIcon}>{isActive ? '🔥' : '❄️'}</Text>
        <Text style={[styles.compactNumber, { color: isActive ? theme.colors.warning : theme.colors.textTertiary }]}>
          {currentStreak}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.streakHeader}>
        <Text style={styles.fireIcon}>{isActive ? '🔥' : '❄️'}</Text>
        <Text style={[styles.streakNumber, { color: isActive ? theme.colors.warning : theme.colors.textTertiary }]}>
          {currentStreak}
        </Text>
      </View>
      <Text style={styles.streakLabel}>
        {t('gamification.streak.days', { count: currentStreak })}
      </Text>
      {longestStreak > 0 && (
        <Text style={styles.longestText}>
          {t('gamification.streak.longest', { count: longestStreak })}
        </Text>
      )}
      {currentStreak === 0 && (
        <Text style={styles.brokenText}>{t('gamification.streak.broken')}</Text>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    alignItems: 'center' as const,
    ...theme.shadows.sm,
  },
  streakHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  fireIcon: {
    fontSize: 28,
  },
  streakNumber: {
    fontSize: 36,
    fontWeight: '700' as const,
    lineHeight: 42,
  },
  streakLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[1],
  },
  longestText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  brokenText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  compactContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  compactIcon: {
    fontSize: 16,
  },
  compactNumber: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
});
