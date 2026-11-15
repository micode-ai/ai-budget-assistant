import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { CommitmentsSummary } from '@/features/analytics/cashFlow';

interface Props {
  commitments: CommitmentsSummary;
  currency: string;
}

/** Fixed costs listed under the bar; the rest are summed into the fixed figure. */
const MAX_ITEMS = 5;

/**
 * Fixed vs flexible spending for the selected period. "Fixed" is only what
 * the app knows repeats (recurring series, tracked subscriptions) — the card
 * says so, because a hand-entered rent reads as flexible. Rendered by both the
 * phone tab and the desktop screen; see docs/wiki/features/analytics-cash-flow.md.
 */
export function CommitmentsCard({ commitments, currency }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { fixed, flexible, fixedShare, items } = commitments;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('analytics.commitmentsTitle')}</Text>
      <View style={styles.card}>
        {fixed <= 0 ? (
          <View style={styles.emptyRow}>
            <Ionicons name="repeat-outline" size={20} color={theme.colors.textTertiary} />
            <Text style={styles.emptyText}>{t('analytics.commitmentsEmpty')}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.headline}>{t('analytics.commitmentsShare', { pct: Math.round(fixedShare) })}</Text>
            <View
              style={styles.bar}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(fixedShare) }}
            >
              <View style={[styles.barFixed, { flex: fixed }]} />
              {flexible > 0 && <View style={[styles.barFlexible, { flex: flexible }]} />}
            </View>

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <View style={styles.statLabelRow}>
                  <View style={[styles.dot, { backgroundColor: theme.colors.primary }]} />
                  <Text style={styles.statLabel}>{t('analytics.commitmentsFixed')}</Text>
                </View>
                <Text style={styles.statValue}>{formatCurrency(fixed, currency)}</Text>
              </View>
              <View style={styles.stat}>
                <View style={styles.statLabelRow}>
                  <View style={[styles.dot, { backgroundColor: theme.colors.border }]} />
                  <Text style={styles.statLabel}>{t('analytics.commitmentsFlexible')}</Text>
                </View>
                <Text style={styles.statValue}>{formatCurrency(flexible, currency)}</Text>
              </View>
            </View>

            <View style={styles.items}>
              {items.slice(0, MAX_ITEMS).map((item) => (
                <View key={item.key} style={styles.itemRow}>
                  <Ionicons
                    name={
                      item.kind === 'recurring' ? 'repeat-outline' : item.kind === 'category' ? 'pricetag-outline' : 'card-outline'
                    }
                    size={18}
                    color={theme.colors.textSecondary}
                  />
                  <View style={styles.itemText}>
                    <Text style={styles.itemLabel} numberOfLines={1}>
                      {item.label || t('analytics.commitmentsRecurring')}
                    </Text>
                    <Text style={styles.itemKind}>
                      {item.kind === 'recurring'
                        ? t('analytics.commitmentsRecurring')
                        : item.kind === 'category'
                          ? t('analytics.commitmentsCategory')
                          : t('analytics.commitmentsSubscription')}
                    </Text>
                  </View>
                  <Text style={styles.itemAmount}>{formatCurrency(item.amount, currency)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
        <Text style={styles.note}>{t('analytics.commitmentsNote')}</Text>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  section: {
    marginBottom: theme.spacing[5],
  },
  sectionTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  headline: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[2],
  },
  bar: {
    flexDirection: 'row' as const,
    height: 10,
    borderRadius: 5,
    overflow: 'hidden' as const,
    backgroundColor: theme.colors.border,
  },
  barFixed: {
    backgroundColor: theme.colors.primary,
  },
  barFlexible: {
    backgroundColor: theme.colors.border,
  },
  statsRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[3],
  },
  stat: {
    flex: 1,
    minWidth: 0,
  },
  statLabelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    marginBottom: theme.spacing[1],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  statValue: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  items: {
    marginTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    paddingTop: theme.spacing[2],
  },
  itemRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  itemText: {
    flex: 1,
    minWidth: 0,
  },
  itemLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
  },
  itemKind: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  itemAmount: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  emptyRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  emptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  note: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[3],
  },
});
