import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { leafletTitle, leafletValidUntil, progressLabel } from '@/features/leaflets/leafletDisplay';
import type { LeafletSession } from '@/features/leaflets/useLeafletSession';
import { LeafletMatchRow } from './LeafletMatchRow';
import { LeafletErrorState, LeafletNoticeBanners } from './LeafletNotices';
import { LeafletActiveList, LeafletBackToList } from './LeafletActiveList';

/**
 * The phone leaflet screen (native, and web below 1024): a header card (chain, "valid until",
 * how many of the user's products are in it), a progress bar while pages are read, inline notices,
 * one row per matched offer, and the "according to a leaflet — check in store" footnote. The idle
 * state lists the account's active leaflets, each of which reopens with its rows (R13).
 */
export function LeafletPhone({ session }: { session: LeafletSession }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { reader, budget, addedIds, addToList, pickImages, retry, active, openLeaflet, closeLeaflet } = session;
  const { result, reading, error, progress } = reader;

  const budgetLeft = budget ? Math.max(0, budget.limit - budget.used) : null;
  const budgetLine =
    budget && budgetLeft !== null
      ? budgetLeft > 0
        ? t('leaflets.budgetLeft', { left: budgetLeft, limit: budget.limit })
        : t('leaflets.budgetExhausted')
      : null;

  const chooseButton = (label: string) => (
    <Pressable onPress={() => void pickImages()} accessibilityRole="button" style={styles.primaryButton}>
      <Ionicons name="images-outline" size={18} color={theme.colors.textInverse} />
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );

  const renderBody = () => {
    if (error) return <LeafletErrorState error={error} onRetry={retry} />;

    if (!result && !reading) {
      return (
        <View style={styles.idle}>
          <Ionicons name="newspaper-outline" size={48} color={theme.colors.primary} />
          <Text style={styles.idleText}>{t('leaflets.intro')}</Text>
          <LeafletNoticeBanners reader={reader} />
          {chooseButton(t('leaflets.chooseImages'))}
          {budgetLine && <Text style={styles.muted}>{budgetLine}</Text>}
          <LeafletActiveList leaflets={active} onOpen={(id) => void openLeaflet(id)} />
        </View>
      );
    }

    const matches = result?.matches ?? [];
    const validUntil = leafletValidUntil(result);
    return (
      <>
        {!reading && (active?.length ?? 0) > 0 && <LeafletBackToList onPress={closeLeaflet} />}
        <View style={styles.headerCard}>
          <Text style={styles.title}>{leafletTitle(result)}</Text>
          {validUntil && <Text style={styles.subtitle}>{validUntil}</Text>}
          <Text style={styles.subtitle}>{t('leaflets.matchCount', { count: matches.length })}</Text>
          {reading && (
            <View accessibilityLiveRegion="polite" style={styles.progress}>
              <Text style={styles.muted}>{progressLabel(progress)}</Text>
              {progress.total > 0 && (
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${(progress.done / progress.total) * 100}%` }]} />
                </View>
              )}
            </View>
          )}
        </View>

        <LeafletNoticeBanners reader={reader} />

        {matches.length > 0 && (
          <View style={styles.list}>
            {matches.map((m) => (
              <LeafletMatchRow key={m.itemId} match={m} added={addedIds.has(m.itemId)} onAdd={addToList} />
            ))}
          </View>
        )}

        {!reading && matches.length === 0 && <Text style={styles.empty}>{t('leaflets.empty')}</Text>}

        <Text style={styles.footnote}>{t('leaflets.footnote')}</Text>

        {!reading && (
          <View style={styles.again}>
            {chooseButton(t('leaflets.readAnother'))}
            {budgetLine && <Text style={styles.muted}>{budgetLine}</Text>}
          </View>
        )}
      </>
    );
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: theme.spacing[8] + insets.bottom }]}
    >
      {renderBody()}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  idle: {
    alignItems: 'center' as const,
    gap: theme.spacing[4],
    paddingTop: theme.spacing[10],
  },
  idleText: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    maxWidth: 360,
  },
  headerCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    gap: theme.spacing[1],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  progress: {
    marginTop: theme.spacing[2],
    gap: theme.spacing[1.5],
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.progressTrack,
    overflow: 'hidden' as const,
  },
  fill: {
    height: 4,
    backgroundColor: theme.colors.primary,
  },
  list: {
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden' as const,
    backgroundColor: theme.colors.surface,
  },
  empty: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[6],
  },
  footnote: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  again: {
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  primaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textInverse,
  },
  muted: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
});
