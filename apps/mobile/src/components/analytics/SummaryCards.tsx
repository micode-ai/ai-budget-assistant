import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { AnalyticsSummary, PeriodComparison, TimeRange } from '@/features/analytics/useAnalytics';

interface Props {
  summary: AnalyticsSummary;
  periodComparison: PeriodComparison;
  selectedRange: TimeRange;
  currency: string;
  onPress: () => void;
}

export function SummaryCards({ summary, periodComparison, selectedRange, currency, onPress }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.summaryRow}>
      <TouchableOpacity
        style={styles.summaryCard}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${t('analytics.totalSpent')}, ${t('analytics.viewExpenses')}`}
      >
        <View style={styles.summaryCardHeader}>
          <Text style={styles.summaryLabel}>{t('analytics.totalSpent')}</Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={theme.colors.textTertiary}
            style={styles.summaryCardChevron}
            accessible={false}
          />
        </View>
        <Text style={styles.summaryValue}>{formatCurrency(summary.totalSpent, currency)}</Text>
        {periodComparison.previousTotal > 0 ? (
          <View style={styles.statsRow}>
            <Ionicons
              name={periodComparison.changePercent > 0 ? 'arrow-up' : 'arrow-down'}
              size={14}
              color={periodComparison.changePercent > 0 ? theme.colors.danger : theme.colors.success}
            />
            <Text style={[
              styles.trendText,
              { color: periodComparison.changePercent > 0 ? theme.colors.danger : theme.colors.success },
            ]}>
              {Math.abs(periodComparison.changePercent).toFixed(0)}%{' '}
              {periodComparison.changePercent > 0
                ? t('analytics.periodUp', { period: t(`analytics.${selectedRange}`) })
                : t('analytics.periodDown', { period: t(`analytics.${selectedRange}`) })
              }
            </Text>
          </View>
        ) : (
          <View style={styles.statsRow}>
            <Ionicons name="receipt-outline" size={14} color={theme.colors.textTertiary} />
            <Text style={styles.statsText}>{summary.transactionCount} {t('analytics.transactions')}</Text>
          </View>
        )}
        {summary.vsAverage !== 0 && (
          <View style={styles.statsRow}>
            <Ionicons
              name={summary.vsAverage > 0 ? 'trending-up' : 'trending-down'}
              size={14}
              color={summary.vsAverage > 0 ? theme.colors.danger : theme.colors.success}
            />
            <Text style={[styles.trendText, { color: summary.vsAverage > 0 ? theme.colors.danger : theme.colors.success }]}>
              {summary.vsAverage > 0
                ? t('analytics.vsAvgUp', { pct: Math.abs(summary.vsAverage).toFixed(0) })
                : t('analytics.vsAvgDown', { pct: Math.abs(summary.vsAverage).toFixed(0) })
              }
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.summaryCard}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${t('analytics.avgPerDay')}, ${t('analytics.viewExpenses')}`}
      >
        <View style={styles.summaryCardHeader}>
          <Text style={styles.summaryLabel}>{t('analytics.avgPerDay')}</Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={theme.colors.textTertiary}
            style={styles.summaryCardChevron}
            accessible={false}
          />
        </View>
        <Text style={styles.summaryValue}>
          {formatCurrency(summary.averagePerDay, currency)}
        </Text>
        <Text style={styles.summarySubtext}>{t(`analytics.this_${selectedRange}`)}</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  summaryRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[5],
  },
  summaryCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  summaryCardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[2],
  },
  summaryCardChevron: {
    opacity: 0.6,
  },
  summaryLabel: {
    ...theme.textStyles.bodyMedium,
    fontSize: 14,
    color: theme.colors.textTertiary,
  },
  summaryValue: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[2],
  },
  statsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
  },
  statsText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  summarySubtext: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  trendText: {
    ...theme.textStyles.caption,
    fontWeight: '600' as const,
  },
});
