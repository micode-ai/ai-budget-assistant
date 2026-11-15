import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { discoveryItems } from '../discoveryItems';

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
      {/* The list lives in ../discoveryItems.ts, shared with the phone strip. */}
      {discoveryItems(selectedYear, onOpenStory).map((item) => (
        <Pressable key={item.key} style={styles.discoveryCard} onPress={item.onPress} accessibilityRole="button">
          <Ionicons name={item.icon} size={20} color={theme.colors.primary} />
          <Text style={styles.discoveryTitle} numberOfLines={1}>{t(item.titleKey)}</Text>
          <Text style={styles.discoverySubtitle} numberOfLines={1}>{t(item.subtitleKey)}</Text>
        </Pressable>
      ))}
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
