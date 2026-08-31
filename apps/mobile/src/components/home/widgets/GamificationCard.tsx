import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import type { HomeWidgetContext } from '../HomeWidgetContext';

export function GamificationCard({ ctx }: { ctx: HomeWidgetContext }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { level, levelProgress, currentStreak } = ctx;

  return (
    <TouchableOpacity key="gamification" style={styles.gamificationCard} activeOpacity={0.7} onPress={() => router.push('/achievements')}>
      <View style={styles.chevronHint}>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </View>
      <Text style={styles.gamificationDate}>
        {new Date().toLocaleDateString(getIntlLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}
      </Text>
      <View style={styles.gamificationRow}>
        <View style={styles.gamificationItem}>
          <View style={[styles.levelBadge, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.levelBadgeText}>{level}</Text>
          </View>
          <View>
            <Text style={styles.gamificationItemTitle}>{t('gamification.level', { level })}</Text>
            <View style={styles.xpBarContainer}>
              <View style={styles.xpBar}>
                <View style={[styles.xpBarFill, { width: `${levelProgress}%`, backgroundColor: theme.colors.primary }]} />
              </View>
            </View>
          </View>
        </View>
        <View style={styles.gamificationDivider} />
        <View style={styles.gamificationItem}>
          <Text style={styles.streakEmoji}>{currentStreak > 0 ? '🔥' : '❄️'}</Text>
          <View style={styles.gamificationTextContainer}>
            <Text style={styles.gamificationItemTitle} numberOfLines={1}>
              {t('gamification.streak.days', { count: currentStreak })}
            </Text>
            <Text style={styles.gamificationItemSubtitle} numberOfLines={1}>
              {currentStreak > 0 ? t('gamification.streak.keepGoing') : t('gamification.streak.broken')}
            </Text>
          </View>
        </View>
      </View>
      <Text style={styles.gamificationLink}>{t('gamification.dashboardWidget.viewAll')}</Text>
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  chevronHint: {
    position: 'absolute' as const,
    top: theme.spacing[3],
    right: theme.spacing[3],
    zIndex: 1,
  },
  gamificationCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
  },
  gamificationDate: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  gamificationRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  gamificationItem: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  gamificationTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  gamificationDivider: {
    width: 1,
    height: 32,
    backgroundColor: theme.colors.borderLight,
    marginHorizontal: theme.spacing[3],
  },
  levelBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  levelBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  gamificationItemTitle: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  gamificationItemSubtitle: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: 1,
  },
  xpBarContainer: {
    marginTop: 3,
  },
  xpBar: {
    height: 3,
    width: 60,
    backgroundColor: theme.colors.progressTrack,
    borderRadius: 1.5,
    overflow: 'hidden' as const,
  },
  xpBarFill: {
    height: '100%' as const,
    borderRadius: 1.5,
  },
  streakEmoji: {
    fontSize: 24,
  },
  gamificationLink: {
    ...theme.textStyles.bodySmMedium,
    color: '#FFFFFF',
    textAlign: 'center' as const,
    marginTop: theme.spacing[3],
    backgroundColor: theme.colors.primary,
    alignSelf: 'center' as const,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden' as const,
  },
});
