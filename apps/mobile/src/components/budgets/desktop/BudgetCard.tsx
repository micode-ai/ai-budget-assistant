import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import { useTheme, useStyles, type Theme } from '@/theme';
import { formatBudgetPeriodRange } from '@/features/budgets/periodNav';
import { DEFAULT_ALERT_THRESHOLD, type ClassifiedBudget } from '@/features/budgets/budgetGrouping';
import { SegmentedProgressBar } from '@/components/shared/SegmentedProgressBar';

interface Props {
  classified: ClassifiedBudget;
  /** "Now" for this render pass — one Date shared by every card in the grid
   *  (design's "this list always shows now", no page-level period control). */
  now: Date;
  anchorDay: number | null;
  onPress: () => void;
}

/**
 * One card in the desktop grid (`docs/design/2026-09-05-budgets-web.md`'s
 * "Card grid and grouping" + "What a multi-category budget shows here").
 * The whole card is a single `Pressable` opening `BudgetDialog` — nothing on
 * it is reachable ONLY by hover (Interactions §Hover).
 */
export function BudgetCard({ classified, now, anchorDay, onPress }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [hovered, setHovered] = useState(false);

  const { budget, progress, percentageUsed, state } = classified;
  const isOverBudget = progress?.isOverBudget ?? false;
  const threshold = budget.alertThreshold ?? DEFAULT_ALERT_THRESHOLD;

  // Departure from mobile: the fill (and, here, the threshold that decides
  // it) uses the budget's own `alertThreshold`, not a hardcoded 80% — kept
  // in sync with the grouping threshold so a card's own bar can never
  // contradict which section it's sitting in.
  const barColor = isOverBudget
    ? theme.colors.danger
    : percentageUsed >= threshold
      ? theme.colors.warning
      : theme.colors.success;

  const periodRange = formatBudgetPeriodRange(
    budget.period,
    now,
    anchorDay,
    getIntlLocale(),
    budget.period === 'custom'
      ? { startDate: new Date(budget.startDate), endDate: budget.endDate ? new Date(budget.endDate) : undefined }
      : undefined,
  );

  const formatShortDate = (d: Date) =>
    new Date(d).toLocaleDateString(getIntlLocale(), { month: 'short', day: 'numeric' });

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={budget.name}
      style={[styles.card, hovered && styles.cardHovered]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.name} numberOfLines={1}>
          {budget.name}
        </Text>
        {/* Only "needs attention" cards carry a status badge — a section
            already titled "On track" repeating that word on every card
            inside it would be the same per-card redundancy decision 1
            resolves for the exhaustion/projected lines, just for chrome
            instead of a sentence. Inactive gets its own muted tag instead,
            regardless of which group it renders in (always "on track"). */}
        {state === 'inactive' ? (
          <View style={styles.inactiveBadge}>
            <Text style={styles.inactiveBadgeText}>{t('budgetDetail.inactive')}</Text>
          </View>
        ) : state === 'over' ? (
          <View style={styles.badgeOver}>
            <Text style={styles.badgeOverText}>{t('budgetDetail.overBudget')}</Text>
          </View>
        ) : state === 'nearing' ? (
          <View style={styles.badgeNearing}>
            <Text style={styles.badgeNearingText}>{t('budgetsDesktop.nearingLimit')}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.periodLabel}>
        {t(`budgets.periods.${budget.period}`)}
        {periodRange ? ` · ${periodRange}` : ''}
      </Text>

      <View style={styles.amountRow}>
        <Text style={styles.spentText}>{formatCurrency(progress?.spent ?? 0, budget.currencyCode)}</Text>
        <Text style={styles.ofText}>
          {t('common.of')} {formatCurrency(budget.amount, budget.currencyCode)}
        </Text>
      </View>

      <SegmentedProgressBar
        categories={progress?.categoryBreakdown}
        totalAmount={budget.amount}
        percentageUsed={percentageUsed}
        barColor={barColor}
        currencyCode={budget.currencyCode}
      />

      {progress && progress.remaining > 0 && (
        <Text style={styles.remainingText}>
          {formatCurrency(progress.remaining, budget.currencyCode)} {t('budgets.remaining')}
        </Text>
      )}

      {/* Collapses mobile's two separately-true sentences (exhaustion date +
          projected-total warning) into one — design decision 1. The amount
          leads (same unit as the spent/of-amount row above it); the date, if
          available, rides along in parenthesis on the same line. */}
      {isOverBudget ? (
        <Text style={styles.exceedsText}>
          {t('budgetsDesktop.exceedsBy', {
            amount: formatCurrency((progress?.spent ?? 0) - budget.amount, budget.currencyCode),
          })}
        </Text>
      ) : progress && progress.projectedTotal > budget.amount ? (
        <Text style={styles.projectedText}>
          {progress.estimatedExhaustionDate
            ? t('budgetsDesktop.projectedExceedBy', {
                amount: formatCurrency(progress.projectedTotal, budget.currencyCode),
                date: formatShortDate(progress.estimatedExhaustionDate),
              })
            : t('insights.projectedTotal', {
                amount: formatCurrency(progress.projectedTotal, budget.currencyCode),
              })}
        </Text>
      ) : null}
    </Pressable>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    flexBasis: '31%' as const,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 300,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    ...theme.shadows.sm,
  },
  cardHovered: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  headerRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  name: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  badgeOver: {
    backgroundColor: theme.colors.dangerLight,
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
  },
  badgeOverText: {
    ...theme.textStyles.caption,
    fontWeight: '600' as const,
    color: theme.colors.danger,
  },
  badgeNearing: {
    backgroundColor: theme.colors.warningLight,
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
  },
  badgeNearingText: {
    ...theme.textStyles.caption,
    fontWeight: '600' as const,
    color: theme.colors.warning,
  },
  inactiveBadge: {
    backgroundColor: theme.colors.surfaceSecondary,
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
  },
  inactiveBadgeText: {
    ...theme.textStyles.caption,
    fontWeight: '600' as const,
    color: theme.colors.textTertiary,
  },
  periodLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[3],
  },
  amountRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  spentText: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  ofText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textTertiary,
  },
  remainingText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.success,
    marginTop: theme.spacing[3],
  },
  exceedsText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.danger,
    marginTop: theme.spacing[2],
    fontWeight: '600' as const,
  },
  projectedText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.warning,
    marginTop: theme.spacing[2],
  },
});
