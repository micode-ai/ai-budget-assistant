import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { LeafletResult } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { leafletTitle, leafletValidUntil } from '@/features/leaflets/leafletDisplay';

/**
 * The account's active leaflets on the idle state (R13), so a leaflet read earlier — or one the
 * community push is about — can be reopened: chain, "valid until" and how many of the user's
 * products are in it. A tap loads the leaflet and shows its rows (Add to list works there).
 * Shared by the phone and desktop bodies; `desktop` only tightens the spacing. Renders nothing for
 * an empty list.
 */
export function LeafletActiveList({
  leaflets,
  onOpen,
  desktop = false,
}: {
  leaflets: LeafletResult[] | null;
  onOpen: (id: string) => void;
  desktop?: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  if (!leaflets || leaflets.length === 0) return null;

  return (
    <View style={[styles.section, desktop && styles.sectionDesktop]}>
      <Text style={styles.heading} accessibilityRole="header">
        {t('leaflets.activeTitle')}
      </Text>
      <View style={styles.list}>
        {leaflets.map((l, i) => {
          const validUntil = leafletValidUntil(l);
          const details = [validUntil, t('leaflets.matchCount', { count: l.matches.length })].filter(Boolean).join(' · ');
          return (
            <Pressable
              key={l.id}
              onPress={() => onOpen(l.id)}
              accessibilityRole="button"
              accessibilityLabel={`${leafletTitle(l)}, ${details}`}
              style={({ pressed }) => [
                styles.row,
                desktop && styles.rowDesktop,
                i > 0 && styles.rowDivider,
                pressed && styles.rowPressed,
              ]}
            >
              <Ionicons name="newspaper-outline" size={20} color={theme.colors.primary} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {leafletTitle(l)}
                </Text>
                <Text style={styles.rowDetails} numberOfLines={1}>
                  {details}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** "Your leaflets" link from a shown leaflet back to the idle state and its list. */
export function LeafletBackToList({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.back}>
      <Ionicons name="chevron-back" size={16} color={theme.colors.primary} />
      <Text style={styles.backText}>{t('leaflets.backToActive')}</Text>
    </Pressable>
  );
}

const createStyles = (theme: Theme) => ({
  section: {
    alignSelf: 'stretch' as const,
    gap: theme.spacing[2],
  },
  sectionDesktop: {
    marginTop: theme.spacing[2],
  },
  heading: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  list: {
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden' as const,
    backgroundColor: theme.colors.surface,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.surface,
  },
  rowDesktop: {
    paddingVertical: theme.spacing[2],
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  rowDetails: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  back: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
  },
  backText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
});
