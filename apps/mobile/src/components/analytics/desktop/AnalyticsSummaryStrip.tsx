import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { useAnalyticsScreenData } from '@/features/analytics/useAnalyticsScreenData';
import type { CategorySpending, TimeRange } from '@/features/analytics/useAnalytics';
import { SummaryTile } from './SummaryTile';

export interface AnalyticsSummaryStripProps {
  summary: ReturnType<typeof useAnalyticsScreenData>['summary'];
  periodComparison: ReturnType<typeof useAnalyticsScreenData>['periodComparison'];
  selectedRange: TimeRange;
  currency: string;
  topCategory: CategorySpending | null;
  onPress: () => void;
}

/**
 * Four tiles: Total Spent, Avg/day (both tap → drill-down, hover-tinted —
 * `Pressable` already gets `cursor:pointer` for free on web from
 * react-native-web's own default styles), Top Category (folded from
 * `QuickInsights`' dropped sentence card — same figure `CategoryBreakdown`'s
 * own first row leads with, via `categorySpending[0]`, not the separately
 * computed `summary.mostExpensiveCategory` string, so this tile can never
 * disagree with the breakdown below it) and Transactions (folded from the
 * count `SummaryCards` used to show only as a fallback when there was no
 * previous period to compare to — now always visible).
 */
export function AnalyticsSummaryStrip({
  summary,
  periodComparison,
  selectedRange,
  currency,
  topCategory,
  onPress,
}: AnalyticsSummaryStripProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.summaryStrip}>
      <SummaryTile label={t('analytics.totalSpent')} onPress={onPress}>
        <Text style={[styles.summaryValue, { fontVariant: ['tabular-nums'] as const }]}>
          {formatCurrency(summary.totalSpent, currency)}
        </Text>
        {periodComparison.previousTotal > 0 && (
          <View style={styles.summaryTrendRow}>
            <Ionicons
              name={periodComparison.changePercent > 0 ? 'arrow-up' : 'arrow-down'}
              size={13}
              color={periodComparison.changePercent > 0 ? theme.colors.danger : theme.colors.success}
            />
            <Text
              style={[
                styles.summaryTrendText,
                { color: periodComparison.changePercent > 0 ? theme.colors.danger : theme.colors.success },
              ]}
            >
              {Math.abs(periodComparison.changePercent).toFixed(0)}%{' '}
              {periodComparison.changePercent > 0
                ? t('analytics.periodUp', { period: t(`analytics.${selectedRange}`) })
                : t('analytics.periodDown', { period: t(`analytics.${selectedRange}`) })}
            </Text>
          </View>
        )}
        {summary.vsAverage !== 0 && (
          <View style={styles.summaryTrendRow}>
            <Ionicons
              name={summary.vsAverage > 0 ? 'trending-up' : 'trending-down'}
              size={13}
              color={summary.vsAverage > 0 ? theme.colors.danger : theme.colors.success}
            />
            <Text
              style={[
                styles.summaryTrendText,
                { color: summary.vsAverage > 0 ? theme.colors.danger : theme.colors.success },
              ]}
            >
              {summary.vsAverage > 0
                ? t('analytics.vsAvgUp', { pct: Math.abs(summary.vsAverage).toFixed(0) })
                : t('analytics.vsAvgDown', { pct: Math.abs(summary.vsAverage).toFixed(0) })}
            </Text>
          </View>
        )}
      </SummaryTile>

      <SummaryTile label={t('analytics.avgPerDay')} onPress={onPress}>
        <Text style={[styles.summaryValue, { fontVariant: ['tabular-nums'] as const }]}>
          {formatCurrency(summary.averagePerDay, currency)}
        </Text>
        <Text style={styles.summarySubtext}>{t(`analytics.this_${selectedRange}`)}</Text>
      </SummaryTile>

      <SummaryTile label={t('analytics.topCategory')}>
        {topCategory ? (
          <>
            <View style={styles.summaryCategoryRow}>
              <View style={[styles.summaryCategoryDot, { backgroundColor: topCategory.color }]} />
              <Text style={styles.summaryCategoryName} numberOfLines={1}>
                {topCategory.name}
              </Text>
            </View>
            <Text style={[styles.summaryValue, { fontVariant: ['tabular-nums'] as const }]}>
              {formatCurrency(topCategory.amount, currency)}
            </Text>
          </>
        ) : (
          <Text style={[styles.summaryValue, { color: theme.colors.textTertiary }]}>—</Text>
        )}
      </SummaryTile>

      {/* `analytics.transactions` is the lowercase noun ("N transactions"),
          written for use inside a sentence (`SummaryCards.tsx`) — wrong case
          for a tile label sitting beside three Title Case ones.
          `drillDown.transactions` is the same word, Title Case, in all nine
          locales, and already the title `DrillDownDialog` shows. */}
      <SummaryTile label={t('drillDown.transactions')}>
        <Text style={[styles.summaryValue, { fontVariant: ['tabular-nums'] as const }]}>
          {summary.transactionCount}
        </Text>
      </SummaryTile>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  summaryStrip: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
  },
  summaryValue: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
  },
  summarySubtext: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  summaryTrendRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    marginTop: theme.spacing[1],
  },
  summaryTrendText: {
    ...theme.textStyles.caption,
    fontWeight: '600' as const,
  },
  summaryCategoryRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    marginBottom: theme.spacing[1],
  },
  summaryCategoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  summaryCategoryName: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
});
