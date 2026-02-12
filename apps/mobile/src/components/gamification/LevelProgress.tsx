import React from 'react';
import { View, Text } from 'react-native';
import { useStyles, useTheme, type Theme } from '@/theme';
import { useTranslation } from 'react-i18next';

interface LevelProgressProps {
  level: number;
  levelProgress: number;
  totalXp: number;
  compact?: boolean;
}

const XP_PER_LEVEL = 100;

export function LevelProgress({ level, levelProgress, totalXp, compact }: LevelProgressProps) {
  const styles = useStyles(createStyles);
  const theme = useTheme();
  const { t } = useTranslation();
  const xpToNext = XP_PER_LEVEL - (totalXp % XP_PER_LEVEL);

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={[styles.levelBadge, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.levelBadgeText}>{level}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.levelBadgeLarge, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.levelBadgeLargeText}>{level}</Text>
        </View>
        <View style={styles.xpInfo}>
          <Text style={styles.levelText}>{t('gamification.level', { level })}</Text>
          <Text style={styles.xpText}>{t('gamification.xpToNext', { xp: xpToNext })}</Text>
        </View>
        <Text style={styles.totalXp}>{t('gamification.totalXp', { xp: totalXp })}</Text>
      </View>
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            { width: `${levelProgress}%`, backgroundColor: theme.colors.primary },
          ]}
        />
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
    gap: theme.spacing[3],
  },
  levelBadgeLarge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  levelBadgeLargeText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700' as const,
  },
  xpInfo: {
    flex: 1,
  },
  levelText: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  xpText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  totalXp: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  progressBar: {
    height: 6,
    backgroundColor: theme.colors.progressTrack,
    borderRadius: 3,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%' as const,
    borderRadius: 3,
  },
  compactContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  levelBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  levelBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700' as const,
  },
});
