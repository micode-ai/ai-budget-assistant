import { useState } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { BudgetCategoryProgress, Currency } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

interface Props {
  /** Per-category breakdown. A budget with 0 or 1 allocation renders as the
   *  plain single-colour fill instead — segmentation only makes sense above
   *  that (there is nothing to segment or list with one entry). */
  categories?: BudgetCategoryProgress[];
  /** Denominator for each segment's width — the bar's own total amount
   *  (not a per-category `allocated`), so segment widths stay proportional
   *  to the whole bar, matching what the plain fill's width means. */
  totalAmount: number;
  /** Drives the plain (non-segmented) fill's width and the trailing
   *  percent text in both the segmented and plain cases. */
  percentageUsed: number;
  /** Fill colour for the plain (non-segmented) bar only. */
  barColor: string;
  currencyCode: Currency;
  /** Legend row is capped to this many entries, "+N more" beyond it. */
  legendMax?: number;
}

/**
 * A progress bar segmented by category, with a compact colour-dot legend —
 * extracted out of `budgets/desktop/BudgetCard.tsx` (`docs/design/
 * 2026-09-05-dashboard-web.md`'s "The monthly budget card's segmented bar")
 * so a second card can reuse the exact same drawing code instead of a second
 * copy of it. `BudgetCard`'s own rendering is unchanged by the extraction.
 */
export function SegmentedProgressBar({
  categories,
  totalAmount,
  percentageUsed,
  barColor,
  currencyCode,
  legendMax = 3,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);

  const isSegmented = !!categories && categories.length > 1;

  const segments = isSegmented
    ? (() => {
        const raw = categories!.map((cat) => ({
          cat,
          widthPct: totalAmount > 0 ? (cat.spent / totalAmount) * 100 : 0,
        }));
        const total = raw.reduce((sum, x) => sum + x.widthPct, 0);
        // Same clip the plain bar already does at 100% — scaled
        // proportionally so an over-budget multi-category bar still sums to
        // exactly one full track width instead of overflowing it.
        const scale = total > 100 ? 100 / total : 1;
        return raw.map((x) => ({ ...x, widthPct: Math.max(0, x.widthPct * scale) }));
      })()
    : [];

  const legendItems = isSegmented ? categories!.slice(0, legendMax) : [];
  const legendMoreCount = isSegmented ? Math.max(0, categories!.length - legendMax) : 0;

  return (
    <>
      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          {isSegmented ? (
            // Raw DOM elements, not RN `View`/`Pressable` — same reasoning as
            // `ExpenseDialog.tsx`'s scrim: a real web-only hover affordance
            // RN's cross-platform prop types don't model, and (unlike
            // `Pressable`) a plain `<div>` carries no `tabIndex`, so hovering
            // a segment can never add a stray Tab stop to the card.
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
                      {seg.cat.categoryName}: {formatCurrency(seg.cat.spent, currencyCode)} /{' '}
                      {formatCurrency(seg.cat.allocated, currencyCode)}
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
    </>
  );
}

const createStyles = (theme: Theme) => ({
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
});
