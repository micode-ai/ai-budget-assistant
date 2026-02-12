import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useStyles, type Theme } from '@/theme';
import { useTranslation } from 'react-i18next';

const GOLD_ACCENT = '#F5A623';

const RARITY_COLORS: Record<string, string> = {
  common: '#A0A0A0',
  rare: '#45B7D1',
  epic: '#4ECDC4',
  legendary: '#F5A623',
};

interface AchievementBadgeProps {
  achievementId: string;
  i18nKey: string;
  icon: string;
  rarity: string;
  xpReward: number;
  progress: number;
  isCompleted: boolean;
  unlockedAt?: string;
  onPress?: () => void;
}

export function AchievementBadge({
  i18nKey,
  icon,
  rarity,
  xpReward,
  progress,
  isCompleted,
  onPress,
}: AchievementBadgeProps) {
  const styles = useStyles(createStyles);
  const { t } = useTranslation();
  const borderColor = isCompleted ? (RARITY_COLORS[rarity] || GOLD_ACCENT) : '#CCCCCC';

  return (
    <TouchableOpacity
      style={[styles.container, { borderColor, opacity: isCompleted ? 1 : 0.6 }]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <View style={[styles.iconContainer, { borderColor }]}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {t(`gamification.achievements.${i18nKey}.title` as any)}
      </Text>
      <Text style={styles.description} numberOfLines={2}>
        {t(`gamification.achievements.${i18nKey}.description` as any)}
      </Text>
      {isCompleted ? (
        <View style={[styles.badge, { backgroundColor: RARITY_COLORS[rarity] || GOLD_ACCENT }]}>
          <Text style={styles.badgeText}>{t('gamification.badges.xpEarned', { xp: xpReward })}</Text>
        </View>
      ) : (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: RARITY_COLORS[rarity] || '#A0A0A0' }]} />
          </View>
          <Text style={styles.progressText}>{t('gamification.badges.progress', { percent: progress })}</Text>
        </View>
      )}
      {rarity === 'legendary' && isCompleted && <View style={styles.shimmerAccent} />}
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => {
  const isDark = theme.colors.background === '#0F1117';

  return {
    container: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.xl,
      borderWidth: 1.5,
      padding: theme.spacing[4],
      alignItems: 'center' as const,
      width: '48%' as const,
      marginBottom: theme.spacing[3],
      overflow: 'hidden' as const,
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDark ? '#1A1A2E' : '#FFF9EE',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginBottom: theme.spacing[2],
      borderWidth: 1.5,
    },
    icon: {
      fontSize: 24,
      lineHeight: 30,
    },
    title: {
      ...theme.textStyles.bodySmMedium,
      color: theme.colors.textPrimary,
      textAlign: 'center' as const,
      marginBottom: theme.spacing[1],
    },
    description: {
      ...theme.textStyles.caption,
      color: theme.colors.textTertiary,
      textAlign: 'center' as const,
      marginBottom: theme.spacing[2],
      lineHeight: 16,
    },
    badge: {
      borderRadius: theme.borderRadius.sm,
      paddingHorizontal: theme.spacing[2],
      paddingVertical: 2,
    },
    badgeText: {
      ...theme.textStyles.caption,
      color: '#FFFFFF',
      fontWeight: '600' as const,
    },
    progressContainer: {
      width: '100%' as const,
      gap: 4,
    },
    progressBar: {
      height: 4,
      backgroundColor: theme.colors.progressTrack,
      borderRadius: 2,
      overflow: 'hidden' as const,
    },
    progressFill: {
      height: '100%' as const,
      borderRadius: 2,
    },
    progressText: {
      ...theme.textStyles.caption,
      color: theme.colors.textTertiary,
      textAlign: 'center' as const,
      fontSize: 10,
    },
    shimmerAccent: {
      position: 'absolute' as const,
      top: 0,
      right: 0,
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: GOLD_ACCENT,
      opacity: 0.08,
      transform: [{ translateX: 20 }, { translateY: -20 }],
    },
  };
};
