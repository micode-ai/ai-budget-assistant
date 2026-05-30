import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { InteractiveDonutChart } from '@/components/interactive-charts';
import { useStyles, type Theme } from '@/theme';
import type { MerchantSpending } from '@/features/analytics/useAnalytics';

interface Props {
  merchantSpending: MerchantSpending[];
  currency: string;
}

const formatChartValue = (value: number) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toFixed(0);
};

export function MerchantBreakdown({ merchantSpending, currency }: Props) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('analytics.byMerchant')}</Text>
      <View style={styles.chartContainer}>
        <InteractiveDonutChart
          data={merchantSpending.map((m) => ({
            label: m.merchant,
            value: m.amount,
            color: m.color,
            id: m.merchant,
          }))}
          size={140}
          formatValue={formatChartValue}
          showLegend={true}
        />
      </View>
      {merchantSpending.map((m) => (
        <View key={m.merchant} style={styles.row}>
          <View style={styles.rowInfo}>
            <View style={[styles.dot, { backgroundColor: m.color }]} />
            <Text style={styles.rowName}>{m.merchant}</Text>
          </View>
          <View style={styles.rowValues}>
            <Text style={styles.rowAmount}>{formatCurrency(m.amount, currency)}</Text>
            <Text style={styles.rowPercent}>{m.percentage.toFixed(0)}%</Text>
          </View>
        </View>
      ))}
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
  chartContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[5],
    ...theme.shadows.sm,
  },
  row: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[2],
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
  },
  rowPercent: {
    ...theme.textStyles.bodyMedium,
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
});
