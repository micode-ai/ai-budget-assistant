import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import { useTheme, useStyles, type Theme } from '@/theme';
import { formatBudgetPeriodRange } from '@/features/budgets/periodNav';
import { DEFAULT_ALERT_THRESHOLD, type ClassifiedBudget } from '@/features/budgets/budgetGrouping';

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
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);

  const { budget, progress, percentageUsed, state } = classified;
  const isOverBudget = progress?.isOverBudget ?? false;
  const threshold = budget.alertThreshold ?? DEFAULT_ALERT_THRESHOLD;

  const breakdown = progress?.categoryBreakdown;
  // A budget with exactly one allocation renders identically to a plain
  // overall budget (design: "there is nothing to segment or list with one
  // entry") — segmentation only kicks in above that.
  const isSegmented = !!breakdown && breakdown.length > 1;

  // Departure from mobile: the fill (and, here, the threshold that decides
  // it) uses the budget's own `alertThreshold`, not a hardcoded 80% — kept
  // in sync with the grouping threshold so a card's own bar can never
  // contradict which section it's sitting in.
  const barColor = isOverBudget
    ? theme.colors.danger
    : percentageUsed >= threshold
      ? theme.colors.warning
      : theme.colors.success;

  const segments = isSegmented
    ? (() => {
        const raw = breakdown!.map((cat) => ({
          cat,
          widthPct: budget.amount > 0 ? (cat.spent / budget.amount) * 100 : 0,
        }));
        const total = raw.reduce((sum, x) => sum + x.widthPct, 0);
        // Same clip mobile's plain bar already does at 100% — scaled
        // proportionally so an over-budget multi-category bar still sums to
        // exactly one full track width instead of overflowing it.
        const scale = total > 100 ? 100 / total : 1;
        return raw.map((x) => ({ ...x, widthPct: Math.max(0, x.widthPct * scale) }));
      })()
    : [];

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

  const legendItems = isSegmented ? breakdown!.slice(0, 3) : [];
  const legendMoreCount = isSegmented ? Math.max(0, breakdown!.length - 3) : 0;

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

      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          {isSegmented ? (
            // Raw DOM elements, not RN `View`/`Pressable` — same reasoning as
            // `ExpenseDialog.tsx`'s scrim: a real web-only hover affordance
            // RN's cross-platform prop types don't model, and (unlike
            // `Pressable`) a plain `<div>` carries no `tabIndex`, so hovering
            // a segment can never add a stray Tab stop to the card (design's
            // Keyboard section: "each card in grid order", not each segment).
            <div style={{ display: 'flex', height: '100%', width: '100%' }}>
              {segments.map((seg, i) => (
                <div
                  key={seg.cat.categoryId}
                  onMouseEnter={() => setHoveredSegment(i)}
                  onMouseLeave={() => setHoveredSegment((cur) => (cur === i ? null : cur))}
                  style={{
                    position: 'relative',
                    height: '100%',
                    width: `${seg.widthPct}%`,
                    backgroundColor: seg.cat.isOverBudget
                      ? theme.colors.danger
                      : seg.cat.categoryColor || theme.colors.textDisabled,
                  }}
                >
                  {hoveredSegment === i && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        marginBottom: 6,
                        padding: '4px 8px',
                        borderRadius: 6,
                        whiteSpace: 'nowrap',
                        backgroundColor: theme.colors.textPrimary,
                        color: theme.colors.background,
                        fontSize: 12,
                        zIndex: 10,
                        pointerEvents: 'none',
                      }}
                    >
                      {seg.cat.categoryName}: {formatCurrency(seg.cat.spent, budget.currencyCode)} /{' '}
                      {formatCurrency(seg.cat.allocated, budget.currencyCode)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(percentageUsed, 100)}%`, backgroundColor: barColor },
              ]}
            />
          )}
        </View>
        <Text style={styles.percentText}>{percentageUsed.toFixed(0)}%</Text>
      </View>

      {isSegmented && (
        <View style={styles.legendRow}>
          {legendItems.map((cat) => (
            <View key={cat.categoryId} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: cat.categoryColor || theme.colors.textDisabled }]} />
              <Text style={styles.legendText} numberOfLines={1}>
                {cat.categoryName}
              </Text>
            </View>
          ))}
          {legendMoreCount > 0 && (
            <Text style={styles.legendMore}>{t('expensesDesktop.showMore', { count: legendMoreCount })}</Text>
          )}
        </View>
      )}

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
  progressRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: theme.colors.progressTrack,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%' as const,
    borderRadius: theme.borderRadius.sm,
  },
  percentText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    width: 40,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  legendRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  legendItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    maxWidth: 120,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  legendMore: {
    ...theme.textStyles.caption,
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
