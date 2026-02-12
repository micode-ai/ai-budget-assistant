import { View, Text, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useGamificationStore } from '@/stores/gamificationStore';
import { AchievementBadge } from '@/components/gamification/AchievementBadge';
import { StreakWidget } from '@/components/gamification/StreakWidget';
import { LevelProgress } from '@/components/gamification/LevelProgress';
import { ACHIEVEMENT_DEFINITIONS } from '@/components/gamification/achievementData';

const RARITY_COLORS: Record<string, string> = {
  common: '#A0A0A0',
  rare: '#45B7D1',
  epic: '#4ECDC4',
  legendary: '#F5A623',
};

const CATEGORY_FILTERS = ['all', 'budget', 'tracking', 'streak', 'milestone', 'savings'] as const;

export default function AchievementsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedAchievement, setSelectedAchievement] = useState<string | null>(null);

  const {
    totalXp, level, levelProgress,
    currentStreak, longestStreak,
    achievements, loadProfile,
  } = useGamificationStore();

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Merge definitions with progress
  const mergedAchievements = ACHIEVEMENT_DEFINITIONS.map((def) => {
    const progress = achievements.find((a) => a.achievementId === def.id);
    return {
      ...def,
      progress: progress?.progress || 0,
      isCompleted: progress?.isCompleted || false,
      unlockedAt: progress?.unlockedAt,
    };
  });

  const filtered = selectedCategory === 'all'
    ? mergedAchievements
    : mergedAchievements.filter((a) => a.category === selectedCategory);

  const completedCount = mergedAchievements.filter((a) => a.isCompleted).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('gamification.title')}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <LevelProgress level={level} levelProgress={levelProgress} totalXp={totalXp} />

        <View style={styles.streakSection}>
          <StreakWidget currentStreak={currentStreak} longestStreak={longestStreak} />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{completedCount}</Text>
            <Text style={styles.statLabel}>{t('gamification.badges.unlocked')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{ACHIEVEMENT_DEFINITIONS.length - completedCount}</Text>
            <Text style={styles.statLabel}>{t('gamification.badges.locked')}</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContainer}
          style={styles.filterScroll}
        >
          {CATEGORY_FILTERS.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.filterChip,
                selectedCategory === cat && { backgroundColor: theme.colors.primary },
              ]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedCategory === cat && { color: '#FFFFFF' },
                ]}
              >
                {t(`gamification.categories.${cat}` as any)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.achievementsGrid}>
          {filtered.map((achievement) => (
            <AchievementBadge
              key={achievement.id}
              achievementId={achievement.id}
              i18nKey={achievement.i18nKey}
              icon={achievement.icon}
              rarity={achievement.rarity}
              xpReward={achievement.xpReward}
              progress={achievement.progress}
              isCompleted={achievement.isCompleted}
              unlockedAt={achievement.unlockedAt}
              onPress={() => setSelectedAchievement(achievement.id)}
            />
          ))}
        </View>
      </ScrollView>

      {selectedAchievement && (() => {
        const def = ACHIEVEMENT_DEFINITIONS.find((d) => d.id === selectedAchievement);
        const prog = achievements.find((a) => a.achievementId === selectedAchievement);
        if (!def) return null;
        const rarityColor = RARITY_COLORS[def.rarity] || '#A0A0A0';
        return (
          <Modal transparent animationType="fade" visible onRequestClose={() => setSelectedAchievement(null)}>
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setSelectedAchievement(null)}
            >
              <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
                <View style={[styles.modalIconContainer, { borderColor: rarityColor }]}>
                  <Text style={styles.modalIcon}>{def.icon}</Text>
                </View>
                <Text style={styles.modalTitle}>
                  {t(`gamification.achievements.${def.i18nKey}.title` as any)}
                </Text>
                <View style={[styles.rarityBadge, { backgroundColor: rarityColor + '20' }]}>
                  <Text style={[styles.rarityText, { color: rarityColor }]}>
                    {def.rarity.charAt(0).toUpperCase() + def.rarity.slice(1)}
                  </Text>
                </View>
                <Text style={styles.modalDescription}>
                  {t(`gamification.achievements.${def.i18nKey}.description` as any)}
                </Text>
                <Text style={[styles.modalXp, { color: rarityColor }]}>
                  {t('gamification.badges.xpEarned', { xp: def.xpReward })}
                </Text>
                {prog?.isCompleted ? (
                  <Text style={styles.modalEarned}>
                    {t('gamification.badges.earned', {
                      date: prog.unlockedAt
                        ? new Date(prog.unlockedAt).toLocaleDateString()
                        : '',
                    })}
                  </Text>
                ) : (
                  <View style={styles.modalProgressContainer}>
                    <View style={styles.modalProgressBar}>
                      <View style={[styles.modalProgressFill, { width: `${prog?.progress || 0}%`, backgroundColor: rarityColor }]} />
                    </View>
                    <Text style={styles.modalProgressText}>
                      {t('gamification.badges.progress', { percent: prog?.progress || 0 })}
                    </Text>
                  </View>
                )}
                <TouchableOpacity style={styles.modalCloseButton} onPress={() => setSelectedAchievement(null)}>
                  <Text style={styles.modalCloseText}>{t('common.ok')}</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        );
      })()}
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  headerTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[8],
    gap: theme.spacing[4],
  },
  streakSection: {
    // no extra styling needed
  },
  statsRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
  },
  statItem: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    alignItems: 'center' as const,
  },
  statNumber: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  statLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  filterScroll: {
    marginHorizontal: -theme.spacing[4],
  },
  filterContainer: {
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[2],
  },
  filterChip: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  filterChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  achievementsGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[6],
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[6],
    alignItems: 'center' as const,
    width: '100%' as const,
    maxWidth: 320,
  },
  modalIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    backgroundColor: theme.colors.background,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  modalIcon: {
    fontSize: 36,
    lineHeight: 44,
  },
  modalTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  rarityBadge: {
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    marginBottom: theme.spacing[3],
  },
  rarityText: {
    ...theme.textStyles.caption,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
  },
  modalDescription: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[3],
    lineHeight: 20,
  },
  modalXp: {
    ...theme.textStyles.bodySmMedium,
    fontWeight: '700' as const,
    marginBottom: theme.spacing[2],
  },
  modalEarned: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[4],
  },
  modalProgressContainer: {
    width: '100%' as const,
    gap: 4,
    marginBottom: theme.spacing[4],
  },
  modalProgressBar: {
    height: 6,
    backgroundColor: theme.colors.progressTrack,
    borderRadius: 3,
    overflow: 'hidden' as const,
  },
  modalProgressFill: {
    height: '100%' as const,
    borderRadius: 3,
  },
  modalProgressText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
  modalCloseButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[6],
  },
  modalCloseText: {
    ...theme.textStyles.bodySmMedium,
    color: '#FFFFFF',
    fontWeight: '600' as const,
  },
});
