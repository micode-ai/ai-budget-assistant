import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { previousMonthParams } from '@/features/insights/previousMonth';

/**
 * Story / Scenario Simulator / Wrapped / Month in review (ABA-641) / Real salary, demoted from mid-scroll full-width
 * banners to a small row of cards (design's "What each mobile
 * affordance becomes"). Story opens `StoryDialog` (Task 7 — a narrative about
 * the period selected on this screen belongs over the screen that selected
 * it) via `onOpenStory`; Scenario Simulator, Wrapped, and Real salary stay pushes — same
 * destinations/params/i18n keys as before.
 */
export function DiscoveryRow({ selectedYear, onOpenStory }: { selectedYear: number; onOpenStory: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.discoveryRow}>
      <Pressable
        style={styles.discoveryCard}
        onPress={onOpenStory}
        accessibilityRole="button"
      >
        <Ionicons name="book-outline" size={20} color={theme.colors.primary} />
        <Text style={styles.discoveryTitle} numberOfLines={1}>{t('story.viewStory')}</Text>
        <Text style={styles.discoverySubtitle} numberOfLines={1}>{t('story.title')}</Text>
      </Pressable>

      <Pressable style={styles.discoveryCard} onPress={() => router.push('/scenario-simulator')} accessibilityRole="button">
        <Ionicons name="flask-outline" size={20} color={theme.colors.primary} />
        <Text style={styles.discoveryTitle} numberOfLines={1}>{t('scenarioSimulator.title')}</Text>
        <Text style={styles.discoverySubtitle} numberOfLines={1}>{t('scenarioSimulator.subtitle')}</Text>
      </Pressable>

      <Pressable
        style={styles.discoveryCard}
        onPress={() => router.push({ pathname: '/wrapped', params: { year: String(selectedYear) } })}
        accessibilityRole="button"
      >
        <Ionicons name="gift-outline" size={20} color={theme.colors.primary} />
        <Text style={styles.discoveryTitle} numberOfLines={1}>{t('wrapped.title')}</Text>
        <Text style={styles.discoverySubtitle} numberOfLines={1}>{t('wrapped.introSub')}</Text>
      </Pressable>

      <Pressable
        style={styles.discoveryCard}
        onPress={() => router.push({ pathname: '/wrapped', params: previousMonthParams() })}
        accessibilityRole="button"
      >
        <Ionicons name="calendar-outline" size={20} color={theme.colors.primary} />
        <Text style={styles.discoveryTitle} numberOfLines={1}>{t('wrapped.monthTitle')}</Text>
        <Text style={styles.discoverySubtitle} numberOfLines={1}>{t('wrapped.monthIntroSub')}</Text>
      </Pressable>

      <Pressable
        style={styles.discoveryCard}
        onPress={() => router.push('/real-salary')}
        accessibilityRole="button"
      >
        <Ionicons name="trending-up-outline" size={20} color={theme.colors.primary} />
        <Text style={styles.discoveryTitle} numberOfLines={1}>{t('realSalary.entryTitle')}</Text>
        <Text style={styles.discoverySubtitle} numberOfLines={1}>{t('realSalary.entrySub')}</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  discoveryRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
  },
  discoveryCard: {
    flexBasis: '18%' as const,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 180,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    gap: theme.spacing[1],
  },
  discoveryTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
  discoverySubtitle: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
});
