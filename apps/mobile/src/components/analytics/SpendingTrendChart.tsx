import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InteractiveBarChart } from '@/components/interactive-charts';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { DailySpending, TimeRange } from '@/features/analytics/useAnalytics';

interface Props {
  dailySpending: DailySpending[];
  selectedRange: TimeRange;
  onBarPress: () => void;
}

const formatChartValue = (value: number) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toFixed(0);
};

export function SpendingTrendChart({ dailySpending, selectedRange, onBarPress }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.chartContainer}>
      <Text style={styles.chartTitle}>
        {selectedRange === 'year' ? t('analytics.spendingByMonth') : t('analytics.spendingTrend')}
      </Text>
      <InteractiveBarChart
        data={dailySpending.map((d) => ({
          label: d.dayLabel,
          value: d.amount,
          id: d.date,
        }))}
        height={180}
        barColor={theme.colors.primary}
        showValues={dailySpending.length <= 12}
        formatValue={formatChartValue}
        onBarPress={onBarPress}
      />
      <Text style={styles.drillDownHint}>{t('drillDown.tapToExplore')}</Text>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  chartContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[5],
    ...theme.shadows.sm,
  },
  chartTitle: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  drillDownHint: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[2],
  },
});
