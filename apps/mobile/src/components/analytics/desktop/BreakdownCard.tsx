import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { InteractiveDonutChart } from '@/components/interactive-charts';
import { useTheme, useStyles, type Theme } from '@/theme';

/**
 * One normalised row for the generic desktop breakdown card. `CategoryBreakdown`,
 * `MerchantBreakdown`, `TagBreakdown`, `ProjectBreakdown` and
 * `IncomeCategoryBreakdown` (all in `src/components/analytics/`, mobile-only,
 * untouched by this file) already compute this exact shape internally — a
 * donut slice plus a coloured-dot row with an amount and a percentage. A
 * future thin adapter maps `CategorySpending` / `MerchantSpending` /
 * `TagSpending` / `ProjectSpending` / `IncomeCategorySpending` onto this type;
 * `delta` and `budget` are the only two per-row extras any of the five
 * actually needs (a vsAverage chip on Category; a budget-progress footer on
 * Project). Everything else about "which breakdown is this" lives entirely
 * in the caller, never here.
 */
export interface BreakdownRow {
  /** Stable key for the chart slice and the list row — categoryId / tagId /
   *  projectId / merchant name, or a positional fallback for a source that
   *  has none (e.g. an uncategorized bucket). */
  id: string;
  name: string;
  amount: number;
  /** 0-100, matching every `*Spending` type's own `percentage` field. */
  percentage: number;
  /** Falls back to a small internal palette when omitted, mirroring
   *  `InteractiveDonutChart`'s own fallback for a slice with no colour — so a
   *  caller that has not resolved a palette yet still renders sensibly. */
  color?: string;
  /** Signed percent vs. a trailing average (Category's vsAverage chip).
   *  `null`/`undefined` (every other breakdown) renders no chip. Only shown
   *  when `Math.abs(delta) >= 5`, matching `CategoryBreakdown`'s own
   *  noise threshold. */
  delta?: number | null;
  /** A budget ceiling to compare `amount` against (Project's per-row budget
   *  bar). `undefined`/`0` renders no footer. */
  budget?: number;
}

export type BreakdownCardSize = 'primary' | 'secondary';

export interface BreakdownCardProps {
  title: string;
  rows: BreakdownRow[];
  /** Display currency for every amount on the card. */
  currency: string;
  /**
   * `'primary'` — the Category tile: always the full list, no collapsing,
   * a larger donut. `'secondary'` — Merchant/Tag/Project/Income: a compact
   * donut plus the top `collapsedRowCount` rows and a "Show all" toggle.
   * Defaults to `'secondary'`.
   */
  size?: BreakdownCardSize;
  /** Overrides the size-derived donut diameter (160 for primary, 140 for
   *  secondary — the exact sizes the five mobile components already use). */
  chartSize?: number;
  /** Rows shown before "Show all" appears. Ignored when `size` is
   *  `'primary'`, which never collapses. Defaults to 5, matching the design
   *  brief's "top 5 + show all". */
  collapsedRowCount?: number;
}

const PRIMARY_CHART_SIZE = 160;
const SECONDARY_CHART_SIZE = 140;
const DEFAULT_COLLAPSED_ROW_COUNT = 5;
/** Vs.-average deltas under this magnitude are noise, not signal — same
 *  threshold `CategoryBreakdown` already uses. */
const DELTA_CHIP_THRESHOLD = 5;

/** Only used when a row omits `color` — mirrors `InteractiveDonutChart`'s own
 *  `DEFAULT_COLORS` fallback so a row list never needs its caller to invent
 *  one. Every real caller (all five *Spending shapes) already resolves a
 *  concrete colour upstream, so this is a defensive fallback, not the
 *  mechanism by which any of the five breakdowns actually gets its palette. */
const FALLBACK_COLORS = [
  '#4ECDC4',
  '#FF6B6B',
  '#45B7D1',
  '#96CEB4',
  '#F5A623',
  '#DDA0DD',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E9',
];

const formatChartValue = (value: number) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toFixed(0);
};

function resolveColor(row: BreakdownRow, index: number): string {
  return row.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

/**
 * Generic desktop-only donut + row-list card. Presentational only — every
 * number it shows arrives already computed in `rows`; it holds no store
 * subscription and no computation of its own. This is the one component the
 * desktop breakdown grid (a later step) fills with Category / Merchant / Tag
 * / Project / Income data via five thin adapters, instead of five separate
 * desktop-specific copies of the mobile components.
 *
 * Does not touch, import, or replace any of
 * `CategoryBreakdown`/`MerchantBreakdown`/`TagBreakdown`/`ProjectBreakdown`/
 * `IncomeCategoryBreakdown` — those keep rendering the phone layout exactly
 * as they do today. Nothing renders this card yet; wiring it into a screen
 * is a separate, later step.
 */
export function BreakdownCard({
  title,
  rows,
  currency,
  size = 'secondary',
  chartSize,
  collapsedRowCount = DEFAULT_COLLAPSED_ROW_COUNT,
}: BreakdownCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [expanded, setExpanded] = useState(false);

  const donutSize = chartSize ?? (size === 'primary' ? PRIMARY_CHART_SIZE : SECONDARY_CHART_SIZE);
  // Primary (Category) never collapses — it is always the full list, per the
  // design's "double-width tile, full list, chips kept".
  const canCollapse = size === 'secondary' && rows.length > collapsedRowCount;
  const visibleRows = canCollapse && !expanded ? rows.slice(0, collapsedRowCount) : rows;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>

      {rows.length === 0 ? (
        // Mirrors CategoryBreakdown's own empty state verbatim (icon + copy),
        // which the design doc names explicitly for reuse. This is the
        // per-card fallback for "this breakdown has nothing this period" —
        // distinct from the coarser "the whole period is empty" case, which
        // a later step collapses the entire grid for instead of rendering
        // per-card empties.
        <View style={styles.empty}>
          <Ionicons name="pie-chart-outline" size={48} color={theme.colors.textDisabled} />
          <Text style={styles.emptyText}>{t('analytics.noData')}</Text>
          <Text style={styles.emptySubtext}>{t('analytics.addExpensesHint')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.chartContainer}>
            <InteractiveDonutChart
              data={rows.map((row, index) => ({
                label: row.name,
                value: row.amount,
                color: resolveColor(row, index),
                id: row.id,
              }))}
              size={donutSize}
              formatValue={formatChartValue}
              showLegend
            />
          </View>

          <View>
            {visibleRows.map((row, index) => {
              const delta = row.delta;
              const showDeltaChip = delta != null && Math.abs(delta) >= DELTA_CHIP_THRESHOLD;
              const isAboveAverage = delta != null && delta > 0;
              const budget = row.budget;
              const hasBudget = budget != null && budget > 0;
              const isOverBudget = hasBudget && row.amount > budget;

              return (
                <View
                  key={row.id}
                  style={[styles.row, index > 0 && styles.rowDivider]}
                >
                  <View style={styles.rowHeader}>
                    <View style={styles.rowInfo}>
                      <View style={[styles.dot, { backgroundColor: resolveColor(row, index) }]} />
                      <Text style={styles.rowName} numberOfLines={1}>
                        {row.name}
                      </Text>
                    </View>
                    <View style={styles.rowValues}>
                      <Text style={styles.rowAmount}>{formatCurrency(row.amount, currency)}</Text>
                      <Text style={styles.rowPercent}>{row.percentage.toFixed(0)}%</Text>
                      {showDeltaChip && (
                        <View
                          style={[
                            styles.deltaChip,
                            {
                              backgroundColor: isAboveAverage
                                ? theme.colors.dangerLight
                                : theme.colors.successLight,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.deltaChipText,
                              { color: isAboveAverage ? theme.colors.danger : theme.colors.success },
                            ]}
                          >
                            {isAboveAverage ? '+' : ''}
                            {Math.round(delta as number)}%
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {hasBudget && (
                    <View style={styles.budgetBar}>
                      <View style={styles.budgetTrack}>
                        <View
                          style={[
                            styles.budgetFill,
                            {
                              width: `${Math.min((row.amount / budget) * 100, 100)}%`,
                              backgroundColor: isOverBudget
                                ? theme.colors.danger
                                : resolveColor(row, index),
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.budgetText}>
                        {isOverBudget
                          ? t('analytics.overBudget')
                          : `${formatCurrency(budget - row.amount, currency)} ${t('projects.budgetRemaining')}`}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {canCollapse && !expanded && (
            <TouchableOpacity
              style={styles.showAllRow}
              onPress={() => setExpanded(true)}
              accessibilityRole="button"
            >
              <Text style={styles.showAllText}>{t('common.showAll')}</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  empty: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[8],
  },
  emptyText: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[3],
  },
  emptySubtext: {
    ...theme.textStyles.bodyMedium,
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
    textAlign: 'center' as const,
  },
  chartContainer: {
    alignItems: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  row: {
    paddingVertical: theme.spacing[3],
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  rowHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  rowInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    flex: 1,
    marginRight: theme.spacing[2],
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: theme.borderRadius.sm,
    flexShrink: 0,
  },
  rowName: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  rowValues: {
    alignItems: 'flex-end' as const,
  },
  rowAmount: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  rowPercent: {
    ...theme.textStyles.bodyMedium,
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  deltaChip: {
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    marginTop: theme.spacing[1],
    alignSelf: 'flex-end' as const,
  },
  deltaChipText: {
    fontSize: 11,
    fontWeight: '600' as const,
    lineHeight: 14,
  },
  budgetBar: {
    marginTop: theme.spacing[2],
  },
  budgetTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.progressTrack,
    overflow: 'hidden' as const,
  },
  budgetFill: {
    height: '100%' as const,
    borderRadius: 3,
  },
  budgetText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  showAllRow: {
    alignItems: 'center' as const,
    paddingTop: theme.spacing[3],
  },
  showAllText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textLink,
  },
});
