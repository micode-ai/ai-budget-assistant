import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { discoveryItems } from './discoveryItems';
import { useAccountStore } from '@/stores/accountStore';

/**
 * Phone: the five "discover" entries as one horizontal strip instead of five
 * full-width banners, so the charts start a screen higher. The list itself is
 * `discoveryItems.ts`, shared with the desktop `DiscoveryRow`.
 */
export function DiscoveryStrip({ selectedYear, onOpenStory }: { selectedYear: number; onOpenStory: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const accountCount = useAccountStore((s) => s.accounts.length);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={styles.stripContent}
    >
      {discoveryItems(selectedYear, onOpenStory, accountCount).map((item) => (
        <TouchableOpacity
          key={item.key}
          style={styles.card}
          onPress={item.onPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${t(item.titleKey)}, ${t(item.subtitleKey)}`}
        >
          <View style={styles.cardTop}>
            <Ionicons name={item.icon} size={20} color={theme.colors.primary} />
            {item.ai && <Ionicons name="sparkles" size={14} color={theme.colors.warning} />}
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {t(item.titleKey)}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {t(item.subtitleKey)}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  strip: {
    // Bleed to the screen edges so the strip visibly scrolls past the padding.
    marginHorizontal: -theme.spacing[4],
    marginBottom: theme.spacing[5],
  },
  stripContent: {
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[3],
  },
  card: {
    width: 148,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    gap: theme.spacing[1],
  },
  cardTop: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[1],
  },
  title: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
  subtitle: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
});
